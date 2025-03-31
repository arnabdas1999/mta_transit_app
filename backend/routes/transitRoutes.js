const express = require("express");
const axios = require("axios");
const { decodeMTAResponse } = require("../utils/protobufDecoder"); // Ensure correct import
const db = require("../config/db");

const router = express.Router();

// The MTA API URLs for different subway lines
const apiUrls = [
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-si",
];

router.get("/update-transit", async (req, res) => {
  let connection;
  try {
    // Fetch data from MTA API with correct headers
    const apiResponses = await Promise.all(
      apiUrls.map((url) =>
        axios.get(url, {
          responseType: "arraybuffer"
        })
      )
    );

    // Get a connection from the pool
    connection = await db.getConnection();
    await connection.beginTransaction(); // Start the transaction

    try {
      const insertRouteQuery =
        "INSERT INTO Routes (route_id) VALUES ? ON DUPLICATE KEY UPDATE route_id = VALUES(route_id)";
      const routeData = new Set(); // Use Set to avoid duplicate entries

      const insertStopQuery =
        "INSERT INTO Stops (stop_id) VALUES ? ON DUPLICATE KEY UPDATE stop_id = VALUES(stop_id)";
      const stopData = new Set();

      const insertTripQuery =
        "INSERT INTO Trips (trip_id, route_id) VALUES ? ON DUPLICATE KEY UPDATE route_id = VALUES(route_id)";
      const tripData = [];

      const insertStopTimeQuery =
        "INSERT INTO StopTimes (trip_id, stop_id, arrival_time, departure_time) VALUES ? ON DUPLICATE KEY UPDATE arrival_time = VALUES(arrival_time), departure_time = VALUES(departure_time)";
      const stopTimeData = [];

      // Process each API response
      apiResponses.forEach((response) => {
        try {
          const decodedData = decodeMTAResponse(Buffer.from(response.data));

          if (!decodedData || !decodedData.entity) {
            console.error("Invalid or empty decoded MTA data");
            return;
          }

          decodedData.entity.forEach((entity) => {
            if (!entity.tripUpdate) return;

            const { trip, stopTimeUpdate } = entity.tripUpdate;
            if (!trip || !stopTimeUpdate) return;

            const routeId = trip.routeId;
            const tripId = trip.tripId;

            routeData.add(routeId); // Store unique route IDs
            tripData.push([tripId, routeId]);

            stopTimeUpdate.forEach((stop) => {
              const stopId = stop.stopId;
              const arrivalTime = stop.arrival ? stop.arrival.time : null;
              const departureTime = stop.departure ? stop.departure.time : null;

              stopData.add(stopId); // Store unique stop IDs
              stopTimeData.push([tripId, stopId, arrivalTime, departureTime]);
            });
          });
        } catch (decodeError) {
          console.error("Error decoding MTA data:", decodeError);
        }
      });

      // Insert routes into database
      if (routeData.size > 0) {
        await connection.query(insertRouteQuery, [Array.from(routeData).map((r) => [r])]);
      }

      // Insert stops into database
      if (stopData.size > 0) {
        await connection.query(insertStopQuery, [Array.from(stopData).map((s) => [s])]);
      }

      // Insert trips into database
      if (tripData.length > 0) {
        await connection.query(insertTripQuery, [tripData]);
      }

      // Insert stop times into database
      if (stopTimeData.length > 0) {
        await connection.query(insertStopTimeQuery, [stopTimeData]);
      }

      await connection.commit(); // Commit transaction if everything succeeds
      res.send("Transit data updated successfully!");
    } catch (dbError) {
      await connection.rollback(); // Rollback transaction if error occurs
      console.error("Database error:", dbError);
      res.status(500).send("Database Error");
    }
  } catch (error) {
    console.error("Error updating transit data:", error);
    res.status(500).send("Internal Server Error");
  } finally {
    if (connection) {
      connection.release(); // Release the connection back to the pool
    }
  }
});

module.exports = router;
