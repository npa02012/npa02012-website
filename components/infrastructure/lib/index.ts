#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { StaticSite } from './constructs/static-site';

class WebsiteStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props: cdk.StackProps) {
        super(parent, name, props);

        new StaticSite(this, 'npa02012-website-construct', {
            domain: this.node.tryGetContext('domain'),
	    portalSubDomain: this.node.tryGetContext('portalSubDomain'),
	    apiSubDomain: this.node.tryGetContext('apiSubDomain'),
            region: 'us-east-1',
        });
    }
}

const app = new cdk.App();

new WebsiteStack(app, 'prod-us-east-1-npa02012-website', {
    env: {
        account: app.node.tryGetContext('accountId'),
        /**
         * Stack must be in us-east-1, because the ACM certificate for a
         * global CloudFront distribution must be requested in us-east-1.
         */
        region: 'us-east-1',
    }
});

app.synth();
