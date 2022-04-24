#!/bin/bash
set -e

#
npm install --prefix components/infrastructure
npm run build --prefix components/infrastructure

#
npm install --prefix components/frontend
npm run build --prefix components/frontend

#
cdk deploy
