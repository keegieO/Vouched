// Lets the app import ../../packages/shared (rules and constants shared with the website).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../../packages/shared');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [sharedRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
// supabase-js's realtime client otherwise resolves the Node build of `ws` under package exports.
config.resolver.unstable_enablePackageExports = false;
module.exports = config;
