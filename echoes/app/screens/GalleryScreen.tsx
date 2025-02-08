import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import { BlurView } from 'expo-blur';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import { useNavigation } from "expo-router";

// Extend the built-in type so that we can access location and localUri.
interface ExtendedAsset extends MediaLibrary.Asset {
  // Not every asset will have these properties.
  location?: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  localUri?: string;
}

// Type definitions for our app.
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
 * Reverse geocoding function using the Mapbox API.
 * Replace the token with your actual Mapbox access token.
 */
async function formatLocation(coords: Coords): Promise<string> {
  const { latitude, longitude } = coords;
  const MAPBOX_API_KEY =
    'pk.eyJ1IjoiZGFuaWVsc3VoMDUiLCJhIjoiY2x4MjJzcTBhMGd0MzJpc2Y0amw5M3I0dSJ9.Uwf4qdHJzCqtCY7B6m-r5Q'; // <-- Replace with your Mapbox token.
  // Mapbox expects coordinates as longitude,latitude.
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_API_KEY}&limit=1`;

  try {
    const response = await fetchWithTimeout(url, { timeout: 15000 });
    const data = await response.json();
    if (data && data.features && data.features.length > 0) {
      return data.features[0].place_name;
    }
  } catch (error) {
    console.error('Error during reverse geocoding:', error);
  }
  // Fallback: return a simple latitude/longitude string.
  return `Lat: ${Number(latitude).toFixed(2)}, Lon: ${Number(longitude).toFixed(2)}`;
}

/**
 * A simple function to compare two locations.
 * Returns true if the difference in latitude and longitude is below the threshold.
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
 * Header component that shows the current location using reverse geocoding.
 * Wrapped in React.memo so it only re-renders when its own props change.
 */
const CurrentLocationText = React.memo(({ coords }: { coords: Coords }) => {
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
});

/**
 * Component that renders an individual photo.
 * It is wrapped in a TouchableOpacity so that tapping it calls the onPress callback.
 */
const PhotoItem = React.memo(
  ({
    photo,
    onPress,
  }: {
    photo: Photo;
    onPress: (photo: Photo) => void;
  }) => {
    return (
      <TouchableOpacity onPress={() => onPress(photo)} style={styles.photoContainer}>
        <Image source={{ uri: photo.uri }} style={styles.image} />
      </TouchableOpacity>
    );
  }
);

/**
 * PhotoList component that renders the grid of photos.
 */
const PhotoList = React.memo(
  ({
    photos,
    onEndReached,
    loadingMore,
    onPhotoPress,
  }: {
    photos: Photo[];
    onEndReached: () => void;
    loadingMore: boolean;
    onPhotoPress: (photo: Photo) => void;
  }) => {
    const renderItem = useCallback(
      ({ item }: { item: Photo }) => {
        return <PhotoItem photo={item} onPress={onPhotoPress} />;
      },
      [onPhotoPress]
    );

    return (
      <FlatList
        data={photos}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator size="small" color="#0000ff" style={{ margin: 20 }} /> : null
        }
        numColumns={3}
        contentContainerStyle={styles.photoListContainer}
      />
    );
  }
);

/**
 * Main PhotoGallery component.
 */
export default function PhotoGallery() {
  const [currentLocation, setCurrentLocation] = useState<Coords | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [visitedLocations, setVisitedLocations] = useState<Coords[]>([]);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({ headerShown: false }); // Remove the title
  }, [navigation]);

  // In-memory cache for asset info.
  const assetCache = useRef<Map<string, ExtendedAsset>>(new Map());

  // --- NEW: Setup for passive notifications when near a photo location ---
  // Cooldown period (in milliseconds) so that the user isn’t spammed repeatedly.
  const NOTIFICATION_COOLDOWN = 10 * 60 * 1000; // 10 minutes

  // A ref to store the latest list of photos.
  const photoLocationsRef = useRef<Photo[]>(photos);
  useEffect(() => {
    photoLocationsRef.current = photos;
  }, [photos]);

  // A ref to keep track of when we last notified the user about a specific photo location.
  const notifiedPhotosRef = useRef<{ [id: string]: number }>({});

  /**
   * Checks whether the current location is near any photo’s location.
   * If so, and if not notified recently, sends a notification.
   */
  function checkForPhotoLocationMatch(currentCoords: Coords) {
    photoLocationsRef.current.forEach((photo) => {
      if (isSameLocation(currentCoords, photo.location, 0.01)) {
        const lastNotified = notifiedPhotosRef.current[photo.id];
        if (!lastNotified || Date.now() - lastNotified > NOTIFICATION_COOLDOWN) {
          sendNotification("You're near a place where you took a photo! Remember this moment?");
          notifiedPhotosRef.current[photo.id] = Date.now();
        }
      }
    });
  }

  // --- End of passive notifications setup ---

  /**
   * Loads a batch of photos from the media library that include location metadata
   * near the provided coordinates.
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

      // Update pagination state.
      setEndCursor(mediaResult.endCursor);
      setHasNextPage(mediaResult.hasNextPage);

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

  // Request permissions on mount.
  useEffect(() => {
    (async () => {
      // Request notification permission.
      const { status: notifStatus } = await Notifications.requestPermissionsAsync();
      if (notifStatus !== 'granted') {
        Alert.alert('Notification permission denied', 'Notifications are required for location alerts.');
      }

      // Request location permission.
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      if (locStatus !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required.');
        return;
      }
      // Request media library permission.
      const { status: mediaStatus } = await MediaLibrary.requestPermissionsAsync();
      if (mediaStatus !== 'granted') {
        Alert.alert('Permission denied', 'Media library access is required.');
        return;
      }

      // Get initial location.
      const locResult = await Location.getCurrentPositionAsync({});
      const coords = locResult.coords;
      setCurrentLocation(coords);

      // Reverse geocode the current location for notification text.
      const locationName = await formatLocation(coords);

      // Check if this location was visited before.
      const alreadyVisited = visitedLocations.some((prev) =>
        isSameLocation(prev, coords, 0.01)
      );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- NEW: Setup a subscription to watch for location updates ---
  useEffect(() => {
    let subscription: Location.LocationSubscription;
    (async () => {
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000, // check every 10 seconds
          distanceInterval: 50, // or every 50 meters
        },
        (location) => {
          const newCoords = location.coords;
          setCurrentLocation(newCoords);
          // Check if we're near a location where we took a photo.
          checkForPhotoLocationMatch(newCoords);
        }
      );
    })();
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);
  // --- End of location subscription setup ---

  // useCallback helps keep the same function reference between renders.
  const handleEndReached = useCallback(() => {
    if (currentLocation && hasNextPage && !loadingMore) {
      loadMorePhotos(currentLocation);
    }
  }, [currentLocation, hasNextPage, loadingMore]);

  // When a photo is tapped, set it as the selected photo to open the zoom modal.
  const handlePhotoPress = (photo: Photo) => {
    setSelectedPhoto(photo);
  };

  return (
    <View style={styles.container}>
      {currentLocation ? (
        <CurrentLocationText coords={currentLocation} />
      ) : (
        <Text style={styles.header}>Fetching location...</Text>
      )}
      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" style={{ marginTop: 50 }} />
      ) : photos.length === 0 ? (
        <Text style={styles.message}>No photos found for this location.</Text>
      ) : (
        <PhotoList
          photos={photos}
          onEndReached={handleEndReached}
          loadingMore={loadingMore}
          onPhotoPress={handlePhotoPress}
        />
      )}

      {/* Modal for zooming in on a photo */}
      <Modal visible={!!selectedPhoto} transparent={true} animationType="fade">
        <View style={styles.modalBackground}>
          <TouchableOpacity style={styles.modalCloseButton} onPress={() => setSelectedPhoto(null)}>
            <Text style={styles.modalCloseText}>Close</Text>
          </TouchableOpacity>
          <ScrollView
            style={styles.modalScrollView}
            maximumZoomScale={3}
            minimumZoomScale={1}
            contentContainerStyle={styles.modalContentContainer}
          >
            {selectedPhoto && (
              <Image source={{ uri: selectedPhoto.uri }} style={styles.modalImage} />
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7', 
    // backgroundColor: 'rgba(245, 245, 247, 0.38)', 
    paddingTop: 30,
  },
  header: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  message: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#666',
  },
  photoListContainer: {
    paddingHorizontal: 2,
  },
  photoContainer: {
    flex: 1,
    margin: 2,
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 1,
    padding: 10,
  },
  modalCloseText: {
    color: '#fff',
    fontSize: 18,
  },
  modalScrollView: {
    flex: 1,
    width: '100%',
  },
  modalContentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
});
