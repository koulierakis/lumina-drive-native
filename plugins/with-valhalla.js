const { withAppBuildGradle } = require('@expo/config-plugins');

const VALHALLA_DEPENDENCY = "implementation 'io.github.rallista:valhalla-mobile:0.5.1'";

module.exports = function withValhalla(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    contents = contents.replace(
      'minSdkVersion rootProject.ext.minSdkVersion',
      'minSdkVersion 26',
    );

    if (!contents.includes(VALHALLA_DEPENDENCY)) {
      const needle = 'dependencies {';
      if (!contents.includes(needle)) {
        throw new Error('Unable to locate Android dependencies block for Valhalla');
      }
      contents = contents.replace(
        needle,
        `${needle}\n    ${VALHALLA_DEPENDENCY}`,
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};
