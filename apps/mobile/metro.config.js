const path = require('path');
const { getDefaultConfig } = require('@expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const mobileNodeModules = path.resolve(projectRoot, 'node_modules');
const rootNodeModules = path.resolve(workspaceRoot, 'node_modules');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [mobileNodeModules, rootNodeModules];

config.resolver.extraNodeModules = {
  react: path.resolve(mobileNodeModules, 'react'),
  'react-native': path.resolve(mobileNodeModules, 'react-native'),
  'react-native-gesture-handler': path.resolve(mobileNodeModules, 'react-native-gesture-handler'),
  'react-native-reanimated': path.resolve(mobileNodeModules, 'react-native-reanimated'),
  'react-native-safe-area-context': path.resolve(mobileNodeModules, 'react-native-safe-area-context'),
  'react-native-screens': path.resolve(mobileNodeModules, 'react-native-screens'),
};

module.exports = config;
