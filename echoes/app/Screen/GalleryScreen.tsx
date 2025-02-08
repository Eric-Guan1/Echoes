import React, { useEffect, useState, useRef } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  Image, 
  StyleSheet, 
  Alert, 
  ActivityIndicator 
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

export default function PhotoGallery() {
  const [currentLocation, setCurrentLocation] = useState<Coords | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [visitedLocations, setVisitedLocations] = useState<Coords[]>([]);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  // Create an in-memory cache for asset info.
  // We now store ExtendedAsset objects, which include location/localUri.
  const assetCache = useRef<Map<string, ExtendedAsset>>(new Map());

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

      // Check if this location was visited before
      const alreadyVisited = visitedLocations.some((prev) => isSameLocation(prev, coords, 0.01));
      if (alreadyVisited) {
        sendNotification(`You're at ${formatLocation(coords)}! Remember this moment?`);
      } else {
        sendNotification(`You're at ${formatLocation(coords)}! Capture the moment?`);
        setVisitedLocations((prev) => [...prev, coords]);
      }

      // Load the first batch of photos
      await loadMorePhotos(coords);
      setLoading(false);
    })();
  }, []);

  async function sendNotification(message: string) {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Location Alert', body: message },
      trigger: null,
    });
  }

  // Simple location comparison using a threshold
  function isSameLocation(a: Coords, b: Coords, threshold: number): boolean {
    return (
      Math.abs(a.latitude - b.latitude) < threshold &&
      Math.abs(a.longitude - b.longitude) < threshold
    );
  }

  async function formatLocation(coords: Coords): Promise<string> {
    const { latitude, longitude } = coords;
    // The "zoom" parameter controls the detail level (18 is very detailed).
    // const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
    
    // try {
    //   const response = await fetch(url, {
    //     // It's good practice to include a valid User-Agent string per Nominatim's policy.
    //     headers: { 'User-Agent': 'YourAppName/1.0 (your-email@example.com)' }
    //   });
    //   const data = await response.json();
    //   console.log(data);
  
    //   if (data && data.display_name) {
    //     // data.display_name typically contains a very specific description (e.g., "Empire State Building, 350, 5th Avenue, ...")
    //     return data.display_name;
    //   }
    // } catch (error) {
    //   console.error("Error during reverse geocoding:", error);
    // }
  
    // Fallback to a simple lat/lon string if reverse geocoding fails.
    return `Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`;
  }
  
  /**
   * Loads a batch of photos from the media library and appends those that
   * have location metadata near the provided location.
   */
  async function loadMorePhotos(coords: Coords) {
    // If there's no more data to load, return early.
    if (!hasNextPage && endCursor) return;
    if (loadingMore) return;

    setLoadingMore(true);

    try {
      // Fetch a batch of photos (e.g., 100 photos)
      const mediaResult = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: 10,
        after: endCursor || undefined,
      });

      // Update pagination state
      setEndCursor(mediaResult.endCursor);
      setHasNextPage(mediaResult.hasNextPage);

      // Process each asset sequentially
      const newPhotos: Photo[] = [];
      for (const asset of mediaResult.assets) {
        let assetInfo: ExtendedAsset;
        if (assetCache.current.has(asset.id)) {
          // We know this value exists, so use the non-null assertion.
          assetInfo = assetCache.current.get(asset.id)!;
        } else {
          // Cast the result as ExtendedAsset so that TS knows location exists (if provided).
          assetInfo = (await MediaLibrary.getAssetInfoAsync(asset.id)) as ExtendedAsset;
          assetCache.current.set(asset.id, assetInfo);
        }

        // Check that assetInfo exists and has a location property.
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

  const renderPhoto = ({ item }: { item: Photo }) => (
    <View style={styles.photoContainer}>
      <Text style={styles.locationText}>{formatLocation(item.location)}</Text>
      <Image source={{ uri: item.uri }} style={styles.image} />
    </View>
  );

  const handleEndReached = () => {
    if (currentLocation && hasNextPage) {
      loadMorePhotos(currentLocation);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        {currentLocation
          ? `Current Location: ${formatLocation(currentLocation)}`
          : 'Fetching location...'}
      </Text>
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