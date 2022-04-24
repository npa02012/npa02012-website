import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';

export interface DynamoProps {
  readonly name: string;
}

export class DynamoResources extends Construct {
  constructor(scope: Construct, id: string, props: DynamoProps) {
    super(scope, id);
    new dynamodb.Table(this, props.name, {
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
  }
} 
