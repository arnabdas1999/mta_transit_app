import requests
import time
import os
import gtfs_realtime_pb2
import mysql.connector

apiUrls = [
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm",
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g",
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz",
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw",
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l",
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-si",
]

# Database connection details
db_config = {
    "host": "localhost",
    "user": "root",
    "password": "Rpb7675910!",
    "database": "mta_transit",
}

def fetch_and_decode_data(api_url):
    """Fetches data from the API and decodes it."""
    try:
        response = requests.get(api_url, stream=True)
        response.raise_for_status()

        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(response.content)
        return feed

    except requests.exceptions.RequestException as e:
        print(f"Error fetching data from {api_url}: {e}")
        return None
    except Exception as e:
        print(f"Error decoding Protocol Buffer data from {api_url}: {e}")
        return None

def store_data_to_db(feed):
    """Stores the decoded data to the MySQL database."""
    try:
        connection = mysql.connector.connect(**db_config)
        cursor = connection.cursor()

        # Prepare data for database insertion
        routes_data = set()
        stops_data = set()
        trips_data = []
        stoptimes_data = []

        for entity in feed.entity:
            if entity.trip_update:
                trip = entity.trip_update.trip
                route_id = trip.route_id
                trip_id = trip.trip_id

                routes_data.add(route_id)
                trips_data.append((trip_id, route_id))

                for stop_time in entity.trip_update.stop_time_update:
                    stop_id = stop_time.stop_id
                    arrival_time = stop_time.arrival.time if stop_time.arrival else None
                    departure_time = stop_time.departure.time if stop_time.departure else None

                    stops_data.add(stop_id)
                    stoptimes_data.append((trip_id, stop_id, arrival_time, departure_time))

        # Insert data into database
        if routes_data:
            cursor.executemany("INSERT IGNORE INTO routes (route_id) VALUES (%s)", [(r,) for r in routes_data])
        if stops_data:
            cursor.executemany("INSERT IGNORE INTO stops (stop_id) VALUES (%s)", [(s,) for s in stops_data])
        if trips_data:
            cursor.executemany("INSERT IGNORE INTO trips (trip_id, route_id) VALUES (%s, %s)", trips_data)
        if stoptimes_data:
            cursor.executemany("INSERT IGNORE INTO stoptimes (trip_id, stop_id, arrival_time, departure_time) VALUES (%s, %s, %s, %s)", stoptimes_data)

        connection.commit()
        print("Data successfully stored to database.")

    except mysql.connector.Error as e:
        print(f"Error storing data to database: {e}")
        if connection and connection.is_connected():
            connection.rollback()
    finally:
        if connection and connection.is_connected():
            cursor.close()
            connection.close()

def run_scheduler(api_urls, interval=120):
    """Runs the scheduler to fetch, decode, and store data in the database."""
    while True:
        for api_url in api_urls:
            feed = fetch_and_decode_data(api_url)
            if feed:
                store_data_to_db(feed)
        time.sleep(interval)

if __name__ == "__main__":
    run_scheduler(apiUrls)