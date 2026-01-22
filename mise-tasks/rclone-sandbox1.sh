#!/usr/bin/env sh
rsync -avz --progress --exclude 'node_modules' --exclude '.git' --exclude 'mise.local.toml' . blog-sandbox:sandbox1