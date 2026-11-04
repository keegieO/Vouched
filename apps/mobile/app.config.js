// Adds Firebase (needed for Android push notifications) only when the file is there,
// so builds still work before Firebase is set up.
//   • On expo.dev: add a "File" environment variable named GOOGLE_SERVICES_JSON
//   • Or locally: put google-services.json next to this file
const fs = require('fs');

module.exports = ({ config }) => {
  const file = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync('./google-services.json') ? './google-services.json' : null);
  if (file) config.android = { ...config.android, googleServicesFile: file };
  return config;
};
