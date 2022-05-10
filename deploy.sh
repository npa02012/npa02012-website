#!/bin/bash
set -e

#
npm install --prefix components/frontend
npm run build --prefix components/frontend

# build the shared code layer
npm install --prefix components/functions/shared-code/nodejs/
npm run build --prefix components/functions/shared-code/nodejs/

# build the functions
npm install --prefix components/functions/add-item/
npm run build --prefix components/functions/add-item/

#
npm install --prefix components/functions/get-items/
npm run build --prefix components/functions/get-items/

#
npm install --prefix components/infrastructure
npm run build --prefix components/infrastructure

#
cdk deploy
