import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as customResources from 'aws-cdk-lib/custom-resources';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Stack, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { UserPoolUser } from './UserPoolUser';

export interface StaticSiteProps {
  domainName: string;
  siteSubDomain: string;
}

/**
 * Static site infrastructure, which deploys site content to an S3 bucket.
 *
 * The site redirects from HTTP to HTTPS, using a CloudFront distribution,
 * Route53 alias record, and ACM certificate.
 */
export class StaticSite extends Construct {
  constructor(parent: Stack, name: string, props: StaticSiteProps) {
    super(parent, name);

    const hostedZone = route53.HostedZone.fromLookup(this, 'TodoApplicationHostedZone', {
      domainName: props.domainName,  //'npa02012.com'
    });

    const frontendCertificate = new acm.DnsValidatedCertificate(this, 'TodoApplicationFrontendCertificate', {
      domainName: 'www.npa02012.com',
      hostedZone: hostedZone,
      region: 'us-east-1'
    });

    const apiCertificate = new acm.DnsValidatedCertificate(this, 'TodoApplicationApiCertificate', {
      domainName: 'todoapplication-api.npa02012.com',
      hostedZone: hostedZone
    });

    const frontendBucket = new s3.Bucket(this, 'TodoApplicationFrontend', {
      websiteIndexDocument: 'index.html',
      publicReadAccess: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    const bucketDeployment = new s3deploy.BucketDeployment(this, 'DeployTodoApplicationFrontend', {
      sources: [s3deploy.Source.asset(`components/frontend/dist/todo-application`)],
      destinationBucket: frontendBucket
    });
    bucketDeployment.node.addDependency(frontendBucket);

    const distribution = new cloudfront.CloudFrontWebDistribution(this, 'SiteDistribution', {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: frontendBucket
          },
          behaviors : [ { isDefaultBehavior: true } ],
        }
      ],
      viewerCertificate: {
        aliases: [ 'www.npa02012.com' ],
        props: {
          acmCertificateArn: frontendCertificate.certificateArn,
          sslSupportMethod: "sni-only",
          minimumProtocolVersion: "TLSv1.2_2021"
        }
      }
    });

    const todoItemsTable = new dynamodb.Table(this, 'TodoApplicationTodoItemsTable', {
      partitionKey: {
        name: 'who',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'creationDate',
        type: dynamodb.AttributeType.STRING
      },
      removalPolicy: RemovalPolicy.DESTROY
    });

    const userPool = new cognito.UserPool(this, "TodoApplicationUserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
	minLength: 8,
        requireLowercase: false,
        requireUppercase: false,
	requireDigits: false,
	requireSymbols: false,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient("TodoApplicationUserPoolClient", {
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [ cognito.OAuthScope.OPENID ],
        callbackUrls: [ `https://www.npa02012.com/` ],
        logoutUrls: [ `https://www.npa02012.com/` ]
      }
    });

    userPool.addDomain("TodoApplicationCognitoDomain", {
      cognitoDomain: {
        domainPrefix: "todo-application",
      },
    });

    new UserPoolUser(parent, 'Guest', {
      userPool: userPool,
      //username: 'guest',
      password: 'password',
      email: 'guest@npa02012.com',
    });


    const sharedCodeLayer = new lambda.LayerVersion(this, 'TodoApplicationSharedCode', {
      code: lambda.Code.fromAsset('components/functions/shared-code'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_14_X]
    });

    const addItemLambda = new lambda.Function(this, 'TodoApplicationAddItemFunction', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('components/functions/add-item', {exclude: ["node_modules", "*.json"]}),
      environment: {
        TODO_ITEMS_TABLE_NAME: todoItemsTable.tableName,
        ALLOWED_ORIGINS: '*'
      },
      layers: [
        sharedCodeLayer
      ]
    })
    todoItemsTable.grantReadWriteData(addItemLambda)

    const getItemsLambda = new lambda.Function(this, 'TodoApplicationGetItemsFunction', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('components/functions/get-items', {exclude: ["node_modules", "*.json"]}),
      environment: {
        TODO_ITEMS_TABLE_NAME: todoItemsTable.tableName,
        ALLOWED_ORIGINS: '*'
      },
      layers: [
        sharedCodeLayer
      ]
    })
    todoItemsTable.grantReadData(getItemsLambda)

    const apiGateway = new apigateway.RestApi(this, 'TodoApplicationApiGateway', {
      restApiName: 'TodoApplicationApi',
      domainName: {
        domainName: 'todoapplication-api.npa02012.com',
        certificate: apiCertificate,
        securityPolicy: apigateway.SecurityPolicy.TLS_1_2
      }
    })

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'TodoApplicationAuthorizer', {
      cognitoUserPools: [userPool]
    });

    const itemResource = apiGateway.root.addResource('item')
    itemResource.addCorsPreflight({
      allowOrigins: [ '*' ],
      allowMethods: [ 'GET', 'PUT' ]
    });
    itemResource.addMethod('PUT', new apigateway.LambdaIntegration(addItemLambda), {
      authorizer: authorizer
    })
    itemResource.addMethod('GET', new apigateway.LambdaIntegration(getItemsLambda), {
      authorizer: authorizer
    })

    const frontendConfig = {
      serverUrl: `https://www.npa02012.com/`,
      region: 'us-east-1',
      cognitoClientId: userPoolClient.userPoolClientId,
      cognitoDomain: 'todo-application',
      itemsApi: 'https://todoapplication-api.npa02012.com/',
      lastChanged: new Date().toUTCString()
    };

    const dataString = `window.AWSConfig = ${JSON.stringify(frontendConfig, null, 4)};`;

    const putUpdate = {
      service: 'S3',
      action: 'putObject',
      parameters: {
        Body: dataString,
        Bucket: `${frontendBucket.bucketName}`,
        Key: 'config.js',
      },
      physicalResourceId: customResources.PhysicalResourceId.of(`${frontendBucket.bucketName}`)
    };

    const s3Upload = new customResources.AwsCustomResource(this, 'TodoApplicationSetConfigJS', {
      policy: customResources.AwsCustomResourcePolicy.fromSdkCalls({resources: customResources.AwsCustomResourcePolicy.ANY_RESOURCE}),
      onUpdate: putUpdate,
      onCreate: putUpdate,
    });
    s3Upload.node.addDependency(bucketDeployment);
    s3Upload.node.addDependency(apiGateway);
    s3Upload.node.addDependency(userPoolClient);

    new route53.ARecord( this, "TodoApplicationWebsiteRecord", {
      recordName:  'www.npa02012.com',
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(distribution))
    });

    new route53.ARecord( this, "TodoApplicationAPIRecord", {
      recordName:  'todoapplication-api.npa02012.com',
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new route53Targets.ApiGateway(apiGateway))
    }); 
    

  }
}
