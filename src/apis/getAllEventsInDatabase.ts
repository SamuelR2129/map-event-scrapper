export const getAllEventsInDatabase = async (): Promise<{ eventName: string }[]> => {
  const url = new URL(process.env.BASE_TEST_SERVER_URL + "/map/events");

  try {
    // const response = await fetch(url.toString(), {
    //   headers: {
    //     "Content-Type": "application/json",
    //   },
    // });

    // if (!response.ok) {
    //   throw new Error(`Getting all events error error: ${response.statusText}`);
    // }

    // return await response.json();

    return [];
  } catch (error) {
    console.error("Google Reverse Geocoding API request failed:", error);
    throw error;
  }
};
