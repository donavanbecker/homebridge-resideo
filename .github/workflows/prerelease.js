#!/bin/env node

import { readFileSync, writeFileSync } from "fs";
import { gt } from "semver";
import { execSync } from "child_process";

function getTagVersionFromNpm(tag) {
  try {
    return execSync(`npm info ${package.name} version --tag="${tag}"`)
      .toString("utf8")
      .trim();
  } catch (e) {
    return null;
  }
}

// load package.json
const package = JSON.parse(readFileSync("package.json", "utf8"));

// work out the correct tag
const currentLatest = getTagVersionFromNpm("latest") || "0.0.0";
const currentBeta = getTagVersionFromNpm("beta") || "0.0.0";
const latestNpmTag = gt(currentBeta, currentLatest, {
  includePrerelease: true,
})
  ? currentBeta
  : currentLatest;
const publishTag = gt(package.version, latestNpmTag, {
  includePrerelease: true,
})
  ? package.version
  : latestNpmTag;

// save the package.json
package.version = publishTag;
writeFileSync("package.json", JSON.stringify(package, null, 4));
