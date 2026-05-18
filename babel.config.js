module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Reanimated worklet plugin must always be last.
      'react-native-reanimated/plugin',
    ],
  };
}
