const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
// The web and mobile apps keep separate dependency trees, sharing pure TS packages.
const repository = path.resolve(__dirname, "../..");
config.watchFolders = [repository];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.join(repository, "node_modules"),
];
config.resolver.disableHierarchicalLookup = false;
module.exports = config;
