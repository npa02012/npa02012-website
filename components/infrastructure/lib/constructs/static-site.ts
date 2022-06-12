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
  domain: string;
  portalSubDomain: string;
  apiSubDomain: string;
  region: string;
}

export class StaticSite extends Construct {
  constructor(parent: Stack, name: string, props: StaticSiteProps) {
    super(parent, name);

    const hostedZone = route53.HostedZone.fromLookup(this, 'TodoApplicationHostedZone', {
      domainName: props.domain,
    });

    const mainCertificate = new acm.DnsValidatedCertificate(this, 'TodoApplicationFrontendMainCertificate', {
      domainName: `www.${props.domain}`,
      subjectAlternativeNames: [props.domain],
      hostedZone: hostedZone,
      region: props.region
    });

    const portalCertificate = new acm.DnsValidatedCertificate(this, 'TodoApplicationFrontendCertificate', {
      domainName: `www.${props.portalSubDomain}.${props.domain}`,
      subjectAlternativeNames: [`${props.portalSubDomain}.${props.domain}`],
      hostedZone: hostedZone,
      region: props.region
    });


    const apiCertificate = new acm.DnsValidatedCertificate(this, 'TodoApplicationApiCertificate', {
      domainName: `${props.apiSubDomain}.${props.domain}`,
      hostedZone: hostedZone
    });

    // Portal bucket and CF Web Dist
    const frontendPortalBucket = new s3.Bucket(this, 'portal-npa02012-site-contents', {
      websiteIndexDocument: 'index.html',
      publicReadAccess: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });



    const portalDistribution = new cloudfront.CloudFrontWebDistribution(this, 'PortalSiteDistribution', {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: frontendPortalBucket
          },
          behaviors : [ { isDefaultBehavior: true } ],
        }
      ],
      viewerCertificate: {
	aliases: [ `www.${props.portalSubDomain}.${props.domain}`, `${props.portalSubDomain}.${props.domain}` ],
        props: {
          acmCertificateArn: portalCertificate.certificateArn,
          sslSupportMethod: "sni-only",
          minimumProtocolVersion: "TLSv1.2_2021"
        }
      }
    });

    const portalBucketDeployment = new s3deploy.BucketDeployment(this, 'DeployPortalNpa02012', {
      sources: [s3deploy.Source.asset(`components/frontend/dist/todo-application`)],
      destinationBucket: frontendPortalBucket,
      distribution: portalDistribution,
      distributionPaths: ['/*'],  // Invalidation for CF distribution caching
    });
    portalBucketDeployment.node.addDependency(frontendPortalBucket);

    // Main bucket and CF Web Dist
    const frontendMainBucket = new s3.Bucket(this, 'main-npa02012-site-contents', {
      websiteIndexDocument: 'index.html',
      publicReadAccess: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    const mainDistribution = new cloudfront.CloudFrontWebDistribution(this, 'mainSiteDistribution', {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: frontendMainBucket
          },
          behaviors : [ { isDefaultBehavior: true } ],
        }
      ],
      viewerCertificate: {
        aliases: [ `www.${props.domain}`, props.domain ],
        props: {
          acmCertificateArn: mainCertificate.certificateArn,
          sslSupportMethod: "sni-only",
          minimumProtocolVersion: "TLSv1.2_2021"
        }
      }
    });

    const mainBucketDeployment = new s3deploy.BucketDeployment(this, 'DeployMainNpa02012', {
      sources: [s3deploy.Source.asset(`components/frontend-main`)],
      destinationBucket: frontendMainBucket,
      distribution: mainDistribution,
      distributionPaths: ['/*'],
    });
    mainBucketDeployment.node.addDependency(frontendMainBucket);



    // Dynamo DB
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

    // Cognito
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
      authFlows: {
        userPassword: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [ cognito.OAuthScope.OPENID ],
        callbackUrls: [ `https://www.${props.portalSubDomain}.${props.domain}/` ],
	      logoutUrls: [ `https://www.${props.portalSubDomain}.${props.domain}/` ],
      }
    });

    userPool.addDomain("TodoApplicationCognitoDomain", {
      cognitoDomain: {
        domainPrefix: "todo-application",
      },
    });
    
    const guestEmail = 'guest@npa02012.com';
    const guestPassword = 'password';
    new UserPoolUser(parent, 'Guest', {
      userPool: userPool,
      password: guestPassword,
      email: guestEmail,
    });

    // Lambda
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
	domainName: `${props.apiSubDomain}.${props.domain}`,
        certificate: apiCertificate,
        securityPolicy: apigateway.SecurityPolicy.TLS_1_2
      }
    });

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
    });
    itemResource.addMethod('GET', new apigateway.LambdaIntegration(getItemsLambda), {
      authorizer: authorizer
    });

    const frontendPortalConfig = {
      serverUrl: `https://www.${props.portalSubDomain}.${props.domain}/`,
      region: props.region,
      cognitoClientId: userPoolClient.userPoolClientId,
      cognitoDomain: 'todo-application',
      itemsApi: `https://${props.apiSubDomain}.${props.domain}/`,
      lastChanged: new Date().toUTCString(),
      guestEmail: guestEmail,
      guestPassword: guestPassword,
    };

    const dataString = `window.AWSConfig = ${JSON.stringify(frontendPortalConfig, null, 4)};`;

    const putUpdate = {
      service: 'S3',
      action: 'putObject',
      parameters: {
        Body: dataString,
        Bucket: `${frontendPortalBucket.bucketName}`,
        Key: 'config.js',
      },
      physicalResourceId: customResources.PhysicalResourceId.of(`${frontendPortalBucket.bucketName}`)
    };

    const s3Upload = new customResources.AwsCustomResource(this, 'TodoApplicationSetConfigJS', {
      policy: customResources.AwsCustomResourcePolicy.fromSdkCalls({resources: customResources.AwsCustomResourcePolicy.ANY_RESOURCE}),
      onUpdate: putUpdate,
      onCreate: putUpdate,
    });
    s3Upload.node.addDependency(portalBucketDeployment);
    s3Upload.node.addDependency(apiGateway);
    s3Upload.node.addDependency(userPoolClient);

    new route53.ARecord( this, "MainWebsiteWwwRecord", {
      recordName: `www.${props.domain}`,
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(mainDistribution))
    });

    new route53.ARecord( this, "MainWebsiteRecord", {
      recordName: `${props.domain}`,
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(mainDistribution))
    });

    new route53.ARecord( this, "PortalWebsiteWwwRecord", {
      recordName: `www.${props.portalSubDomain}.${props.domain}`,
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(portalDistribution))
    });

    new route53.ARecord( this, "PortalWebsiteRecord", {
      recordName: `${props.portalSubDomain}.${props.domain}`,
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(portalDistribution))
    });

    new route53.ARecord( this, "ApiRecord", {
      recordName: `${props.apiSubDomain}.${props.domain}`,
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new route53Targets.ApiGateway(apiGateway))
    }); 

  }
}
