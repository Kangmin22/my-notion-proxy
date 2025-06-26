// api/functions.js
const { primitiveFunctions } = require('./execute.js');

module.exports = async (request, response) => {
  try {
    const functionDocs = Object.entries(primitiveFunctions).map(([name, data]) => ({
      name: name,
      description: data.description,
    }));
    response.status(200).json({ functions: functionDocs });
  } catch (error) {
    response.status(500).json({ error: "Failed to retrieve function documentation." });
  }
};
