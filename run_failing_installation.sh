#!/bin/bash

set -euo pipefail

npm run clean

npm install

cd examples/acephei

npm install
