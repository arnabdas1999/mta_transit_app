const protobuf = require("protobufjs");
const path = require("path");

const protoFilePath = path.join(__dirname, "../proto/mta__transit.proto");

let TransitMessage = null;

// Load the protobuf file and cache the decoded message type
const loadProtoSchema = async () => {
  try {
    const root = await protobuf.load(protoFilePath);
    TransitMessage = root.lookupType("mta_transit.FeedMessage");
    console.log("Protobuf schema loaded successfully.");
  } catch (err) {
    console.error("Error loading protobuf schema:", err);
    throw err; // Rethrow the error if loading the schema fails
  }
};

// Load the protobuf schema when the module is required
loadProtoSchema();

// Function to decode binary MTA response
async function decodeMTAResponse(data) {
  if (!TransitMessage) {
    throw new Error("Proto file not loaded yet. Please check server startup logs.");
  }

  try {
    // Log data length and the first 20 bytes of the data for inspection
    console.log(`Decoding data of length: ${data.length}`);
    console.log(`First 20 bytes of data (hex): ${data.slice(0, 20).toString('hex')}`);

    // Check if the data length is within a reasonable range
    if (data.length < 100) {
      throw new Error("Data length is too small to decode properly.");
    }

    // Attempt to decode the message
    const decodedMessage = TransitMessage.decode(new Uint8Array(data));

    // Log the decoded message for inspection
    console.log("Decoded message:", decodedMessage);

    // Return the decoded message as an object
    return TransitMessage.toObject(decodedMessage, {
      longs: String,
      enums: String,
      bytes: String,
    });
  } catch (error) {
    // Log the error and the raw data for further analysis
    console.error("Error decoding MTA data:", error);
    console.error("Raw data (hex):", data.toString('hex'));

    throw error; // Rethrow the error to propagate it
  }
}

module.exports = { decodeMTAResponse };
