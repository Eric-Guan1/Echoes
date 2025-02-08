import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';

// Extend the built-in type so that we can access location and localUri.
interface ExtendedAsset extends MediaLibrary.Asset {
  // These properties are optional since not every asset may have them.
  location?: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  localUri?: string;
}

// Type definitions for our app
type Coords = {
  latitude: number;
  longitude: number;
};

type Photo = {
  id: string;
  uri: string;
  location: Coords;
};

/**
 * Helper function that wraps fetch with a timeout using AbortController.
 * @param resource URL or RequestInfo
 * @param options fetch options including an optional timeout in milliseconds.
 */
async function fetchWithTimeout(
  resource: RequestInfo,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = 10000 } = options; // Default timeout: 10 seconds.
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Reverse geocoding function that returns a human-readable location string.
 * It uses fetchWithTimeout so that slow responses don’t block the UI.
 */
async function formatLocation(coords: Coords): Promise<string> {
  const { latitude, longitude } = coords;
  const url = `http://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
console.log(url);

  try {
    const response = await fetchWithTimeout(url, {
      timeout: 15000, // 15 seconds timeout
    });
    const data = await response.json();
    console.log(data);

    if (data && data.display_name) {
      return data.display_name;
    }
  } catch (error) {
    console.error('Error during reverse geocoding:', error);
  }
  // Fallback to a simple lat/lon string if reverse geocoding fails.
  return `Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`;
}

/**
 * The main PhotoGallery component.
 */
export default function PhotoGallery() {
  const [currentLocation, setCurrentLocation] = useState<Coords | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [visitedLocations, setVisitedLocations] = useState<Coords[]>([]);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  // Create an in-memory cache for asset info.
  const assetCache = useRef<Map<string, ExtendedAsset>>(new Map());

  /**
   * Simple location comparison using a threshold.
   * Returns true if both coordinates are within `threshold` of each other.
   */
  function isSameLocation(a: Coords, b: Coords, threshold: number): boolean {
    return (
      Math.abs(a.latitude - b.latitude) < threshold &&
      Math.abs(a.longitude - b.longitude) < threshold
    );
  }

  /**
   * Schedules a notification with the provided message.
   */
  async function sendNotification(message: string) {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Location Alert', body: message },
      trigger: null,
    });
  }

  /**
   * Loads a batch of photos from the media library and appends those that
   * have location metadata near the provided location.
   */
  async function loadMorePhotos(coords: Coords) {
    if (!hasNextPage && endCursor) return;
    if (loadingMore) return;

    setLoadingMore(true);

    try {
      // Fetch a batch of photos (e.g., 10 photos)
      const mediaResult = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: 10,
        after: endCursor || undefined,
      });

      // Update pagination state
      setEndCursor(mediaResult.endCursor);
      setHasNextPage(mediaResult.hasNextPage);

      // Process each asset
      const newPhotos: Photo[] = [];
      for (const asset of mediaResult.assets) {
        let assetInfo: ExtendedAsset;
        if (assetCache.current.has(asset.id)) {
          assetInfo = assetCache.current.get(asset.id)!;
        } else {
          assetInfo = (await MediaLibrary.getAssetInfoAsync(asset.id)) as ExtendedAsset;
          assetCache.current.set(asset.id, assetInfo);
        }

        if (assetInfo && assetInfo.location) {
          // Only include photos with location metadata near the current location.
          if (
            isSameLocation(
              {
                latitude: assetInfo.location.latitude,
                longitude: assetInfo.location.longitude,
              },
              coords,
              0.05
            )
          ) {
            newPhotos.push({
              id: assetInfo.id,
              uri: assetInfo.localUri || assetInfo.uri,
              location: {
                latitude: assetInfo.location.latitude,
                longitude: assetInfo.location.longitude,
              },
            });
          }
        }
      }
      setPhotos((prevPhotos) => [...prevPhotos, ...newPhotos]);
    } catch (error) {
      console.error('Error loading more photos', error);
    } finally {
      setLoadingMore(false);
    }
  }

  // On mount: request permissions, fetch the current location, send a notification, and load photos.
  useEffect(() => {
    (async () => {
      // Request location permission
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      if (locStatus !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required.');
        return;
      }
      // Request media library permission
      const { status: mediaStatus } = await MediaLibrary.requestPermissionsAsync();
      if (mediaStatus !== 'granted') {
        Alert.alert('Permission denied', 'Media library access is required.');
        return;
      }

      // Get current location
      const locResult = await Location.getCurrentPositionAsync({});
      const coords = locResult.coords;
      setCurrentLocation(coords);

      // Reverse geocode the current location for notification text.
      const locationName = await formatLocation(coords);

      // Check if this location was visited before.
      const alreadyVisited = visitedLocations.some((prev) => isSameLocation(prev, coords, 0.01));
      if (alreadyVisited) {
        sendNotification(`You're at ${locationName}! Remember this moment?`);
      } else {
        sendNotification(`You're at ${locationName}! Capture the moment?`);
        setVisitedLocations((prev) => [...prev, coords]);
      }

      // Load the first batch of photos.
      await loadMorePhotos(coords);
      setLoading(false);
    })();
  }, []);

  // --- Components for displaying reverse geocoded text ---

  /**
   * Component that displays the current location with a reverse geocoded string.
   */
  const CurrentLocationText = ({ coords }: { coords: Coords }) => {
    const [locationName, setLocationName] = useState<string>('Loading location...');
    useEffect(() => {
      let isMounted = true;
      async function fetchLocation() {
        const name = await formatLocation(coords);
        if (isMounted) setLocationName(name);
      }
      fetchLocation();
      return () => {
        isMounted = false;
      };
    }, [coords]);
    return <Text style={styles.header}>Current Location: {locationName}</Text>;
  };

  /**
   * Component that renders an individual photo along with its reverse geocoded location.
   */
  const PhotoItem = ({ photo }: { photo: Photo }) => {
    const [locationName, setLocationName] = useState<string>('Loading location...');
    useEffect(() => {
      let isMounted = true;
      async function fetchLocation() {
        const name = await formatLocation(photo.location);
        if (isMounted) setLocationName(name);
      }
      fetchLocation();
      return () => {
        isMounted = false;
      };
    }, [photo.location]);
    return (
      <View style={styles.photoContainer}>
        <Text style={styles.locationText}>{locationName}</Text>
        <Image source={{ uri: photo.uri }} style={styles.image} />
      </View>
    );
  };

  // Render function for the FlatList.
  const renderPhoto = ({ item }: { item: Photo }) => <PhotoItem photo={item} />;

  /**
   * Called when the end of the FlatList is reached to load more photos.
   */
  const handleEndReached = () => {
    if (currentLocation && hasNextPage) {
      loadMorePhotos(currentLocation);
    }
  };

  return (
    <View style={styles.container}>
      {currentLocation ? (
        <CurrentLocationText coords={currentLocation} />
      ) : (
        <Text style={styles.header}>Fetching location...</Text>
      )}
      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : photos.length === 0 ? (
        <Text style={styles.message}>No photos found for this location.</Text>
      ) : (
        <FlatList
          data={photos}
          renderItem={renderPhoto}
          keyExtractor={(item) => item.id}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator size="small" color="#0000ff" /> : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  message: { textAlign: 'center', marginTop: 20 },
  photoContainer: { marginBottom: 20, alignItems: 'center' },
  locationText: { marginBottom: 5 },
  image: { width: 150, height: 150, borderRadius: 4 },
});
