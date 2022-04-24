#!/bin/bash
set -e

#
npm install
npm run build

#
npm install --prefix frontend
npm run build --prefix frontend

#
cdk deploy

#
rm lib/*.js


