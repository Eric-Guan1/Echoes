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
  Dimensions,
} from 'react-native';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import { useNavigation } from 'expo-router';
import { Video } from 'expo-av';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as FileSystem from 'expo-file-system';

// Extend the built-in type so that we can access location and localUri.
interface ExtendedAsset extends MediaLibrary.Asset {
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

// Updated type for a media asset (photo or video).
// For video items we add an optional thumbnailUri and duration (in seconds).
export type Photo = {
  id: string;
  uri: string; // For playback or full image.
  location: Coords;
  mediaType: 'photo' | 'video';
  thumbnailUri?: string; // Only set for video assets.
  duration?: number; // Video duration in seconds.
};

/**
 * Copies a file (in this case, a video) to the app's cache directory so that it becomes accessible.
 */
async function copyVideoToCache(uri: string): Promise<string> {
  const fileName = uri.split('/').pop();
  if (!fileName) throw new Error('Could not determine file name');
  const dest = FileSystem.cacheDirectory + fileName;
  const fileInfo = await FileSystem.getInfoAsync(dest);
  if (!fileInfo.exists) {
    await FileSystem.copyAsync({
      from: uri,
      to: dest,
    });
  }
  return dest;
}

/**
 * Helper function that wraps fetch with a timeout using AbortController.
 */
async function fetchWithTimeout(
  resource: RequestInfo,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = 10000 } = options;
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
    'pk.eyJ1IjoiZGFuaWVsc3VoMDUiLCJhIjoiY2x4MjJzcTBhMGd0MzJpc2Y0amw5M3I0dSJ9.Uwf4qdHJzCqtCY7B6m-r5Q'; // <-- Replace with your token.
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
  return `Lat: ${Number(latitude).toFixed(2)}, Lon: ${Number(longitude).toFixed(2)}`;
}

/**
 * Compares two locations; returns true if they are within a given threshold.
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
 * Helper function to format a duration (in seconds) to a "mm:ss" string.
 */
function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Header component that shows the current location using reverse geocoding.
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
    return () => { isMounted = false; };
  }, [coords]);
  return <Text style={styles.header}>Current Location: {locationName}</Text>;
});

/**
 * Component that renders an individual media item (photo or video).
 * For video items, we display the generated thumbnail (or fallback to the uri)
 * and overlay both a play icon at the top left and the video duration at the bottom right.
 */
const PhotoItem = React.memo(({ photo, onPress }: { photo: Photo; onPress: (photo: Photo) => void; }) => {
  const imageUri = photo.mediaType === 'video' ? photo.thumbnailUri || photo.uri : photo.uri;
  return (
    <TouchableOpacity onPress={() => onPress(photo)} style={styles.photoContainer}>
      <Image source={{ uri: imageUri }} style={styles.image} />
      {photo.mediaType === 'video' && (
        <>
          <View style={styles.videoIconOverlay}>
            <Text style={styles.videoIconText}>▶</Text>
          </View>
          {photo.duration !== undefined && (
            <View style={styles.videoDurationOverlay}>
              <Text style={styles.videoDurationText}>{formatDuration(photo.duration)}</Text>
            </View>
          )}
        </>
      )}
    </TouchableOpacity>
  );
});

/**
 * Component that renders the grid of media items.
 */
const PhotoList = React.memo(({ photos, onEndReached, loadingMore, onPhotoPress, }: {
  photos: Photo[];
  onEndReached: () => void;
  loadingMore: boolean;
  onPhotoPress: (photo: Photo) => void;
}) => {
  const renderItem = useCallback(({ item }: { item: Photo }) => <PhotoItem photo={item} onPress={onPhotoPress} />, [onPhotoPress]);
  return (
    <FlatList
      data={photos}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListFooterComponent={loadingMore ? (<ActivityIndicator size="small" color="#0000ff" style={{ margin: 20 }} />) : null}
      numColumns={3}
      contentContainerStyle={styles.photoListContainer}
    />
  );
});

/**
 * The main PhotoGallery component.
 */
export default function PhotoGallery() {
  const [currentLocation, setCurrentLocation] = useState<Coords | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [visitedLocations, setVisitedLocations] = useState<Coords[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const navigation = useNavigation();

  // Separate pagination state for photos and videos.
  const [photoCursor, setPhotoCursor] = useState<string | null>(null);
  const [videoCursor, setVideoCursor] = useState<string | null>(null);
  const [photoHasNextPage, setPhotoHasNextPage] = useState<boolean>(true);
  const [videoHasNextPage, setVideoHasNextPage] = useState<boolean>(true);
  const hasNextPage = photoHasNextPage || videoHasNextPage;

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Cache asset info in memory.
  const assetCache = useRef<Map<string, ExtendedAsset>>(new Map());

  // For notifications based on location.
  const NOTIFICATION_COOLDOWN = 10 * 60 * 1000;
  const photoLocationsRef = useRef<Photo[]>(photos);
  useEffect(() => {
    photoLocationsRef.current = photos;
  }, [photos]);
  const notifiedPhotosRef = useRef<{ [id: string]: number }>({});

  function checkForPhotoLocationMatch(currentCoords: Coords) {
    photoLocationsRef.current.forEach((photo) => {
      if (isSameLocation(currentCoords, photo.location, 0.01)) {
        const lastNotified = notifiedPhotosRef.current[photo.id];
        if (!lastNotified || Date.now() - lastNotified > NOTIFICATION_COOLDOWN) {
          sendNotification("You're near a place where you captured a moment! Remember this experience?");
          notifiedPhotosRef.current[photo.id] = Date.now();
        }
      }
    });
  }

  /**
   * Loads more media items (photos and videos) with separate pagination for each.
   */
  async function loadMorePhotos(coords: Coords) {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      // Query photo assets using its own cursor.
      const photoResult = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: 10,
        after: photoCursor || undefined,
      });
      setPhotoCursor(photoResult.endCursor);
      setPhotoHasNextPage(photoResult.hasNextPage);

      // Query video assets using its own cursor.
      const videoResult = await MediaLibrary.getAssetsAsync({
        mediaType: 'video',
        first: 10,
        after: videoCursor || undefined,
      });
      setVideoCursor(videoResult.endCursor);
      setVideoHasNextPage(videoResult.hasNextPage);

      // Process photo assets.
      const processedPhotos = await Promise.all(
        photoResult.assets.map(async (asset) => {
          let assetInfo: ExtendedAsset;
          if (assetCache.current.has(asset.id)) {
            assetInfo = assetCache.current.get(asset.id)!;
          } else {
            assetInfo = (await MediaLibrary.getAssetInfoAsync(asset.id)) as ExtendedAsset;
            assetCache.current.set(asset.id, assetInfo);
          }
          // For photos, include them even if they lack location data.
          if (assetInfo.location && !isSameLocation(
            { latitude: assetInfo.location.latitude, longitude: assetInfo.location.longitude },
            coords,
            0.05
          )) {
            return null;
          }
          return {
            id: assetInfo.id,
            uri: assetInfo.localUri || assetInfo.uri,
            location: assetInfo.location
              ? {
                  latitude: assetInfo.location.latitude,
                  longitude: assetInfo.location.longitude,
                }
              : { latitude: 0, longitude: 0 },
            mediaType: 'photo' as const,
          } as Photo;
        })
      );

      // Process video assets.
      const processedVideos = await Promise.all(
        videoResult.assets.map(async (asset) => {
          let assetInfo: ExtendedAsset;
          if (assetCache.current.has(asset.id)) {
            assetInfo = assetCache.current.get(asset.id)!;
          } else {
            assetInfo = (await MediaLibrary.getAssetInfoAsync(asset.id)) as ExtendedAsset;
            assetCache.current.set(asset.id, assetInfo);
          }
          // For videos, require that location metadata exists and matches.
          if (!assetInfo.location) return null;
          if (
            !isSameLocation(
              { latitude: assetInfo.location.latitude, longitude: assetInfo.location.longitude },
              coords,
              0.05
            )
          ) {
            return null;
          }
          // Build the video asset.
          const mediaItem: Photo = {
            id: assetInfo.id,
            uri: assetInfo.localUri || assetInfo.uri,
            location: {
              latitude: assetInfo.location.latitude,
              longitude: assetInfo.location.longitude,
            },
            mediaType: 'video',
            duration: assetInfo.duration, // Set video duration (in seconds).
          };

          try {
            // Copy the video to cache so that it is accessible.
            const accessibleUri = await copyVideoToCache(mediaItem.uri);
            mediaItem.uri = accessibleUri;
            // Generate a thumbnail.
            const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(accessibleUri, {
              time: 1000,
            });
            mediaItem.thumbnailUri = thumbUri;
          } catch (e) {
            console.warn('Error generating thumbnail for video:', mediaItem.uri, e);
          }
          return mediaItem;
        })
      );

      // Merge the processed results and filter out nulls.
      const mergedMedia: Photo[] = [
        ...processedPhotos.filter((item): item is Photo => item !== null),
        ...processedVideos.filter((item): item is Photo => item !== null),
      ];

      // Merge with the existing state and deduplicate by asset ID.
      setPhotos((prevPhotos) => {
        const combined = [...prevPhotos, ...mergedMedia];
        const deduped = Array.from(new Map(combined.map(item => [item.id, item])).values());
        return deduped;
      });
    } catch (error) {
      console.error('Error loading more photos', error);
    } finally {
      setLoadingMore(false);
    }
  }

  // Request permissions and load initial data.
  useEffect(() => {
    (async () => {
      const { status: notifStatus } = await Notifications.requestPermissionsAsync();
      if (notifStatus !== 'granted') {
        Alert.alert('Notification permission denied', 'Notifications are required for location alerts.');
      }
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      if (locStatus !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required.');
        return;
      }
      const { status: mediaStatus } = await MediaLibrary.requestPermissionsAsync();
      if (mediaStatus !== 'granted') {
        Alert.alert('Permission denied', 'Media library access is required.');
        return;
      }
      const locResult = await Location.getCurrentPositionAsync({});
      const coords = locResult.coords;
      setCurrentLocation(coords);
      const locationName = await formatLocation(coords);
      const alreadyVisited = visitedLocations.some((prev) => isSameLocation(prev, coords, 0.01));
      if (alreadyVisited) {
        sendNotification(`You're at ${locationName}! Remember this moment?`);
      } else {
        sendNotification(`You're at ${locationName}! Capture the moment?`);
        setVisitedLocations((prev) => [...prev, coords]);
      }
      await loadMorePhotos(coords);
      setLoading(false);
    })();
  }, []);

  // Subscribe to location updates.
  useEffect(() => {
    let subscription: Location.LocationSubscription;
    (async () => {
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000,
          distanceInterval: 50,
        },
        (location) => {
          const newCoords = location.coords;
          setCurrentLocation(newCoords);
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

  const handleEndReached = useCallback(() => {
    if (currentLocation && hasNextPage && !loadingMore) {
      loadMorePhotos(currentLocation);
    }
  }, [currentLocation, hasNextPage, loadingMore]);

  const handlePhotoPress = (photo: Photo) => {
    const index = photos.findIndex((p) => p.id === photo.id);
    if (index !== -1) {
      setSelectedIndex(index);
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
        <ActivityIndicator size="large" color="#0000ff" style={{ marginTop: 50 }} />
      ) : photos.length === 0 ? (
        <Text style={styles.message}>No media items found for this location.</Text>
      ) : (
        <PhotoList
          photos={photos}
          onEndReached={handleEndReached}
          loadingMore={loadingMore}
          onPhotoPress={handlePhotoPress}
        />
      )}
      <Modal visible={selectedIndex !== null} transparent={true} animationType="fade">
        <ModalPhotoViewer
          photos={photos}
          initialIndex={selectedIndex !== null ? selectedIndex : 0}
          onClose={() => setSelectedIndex(null)}
        />
      </Modal>
    </View>
  );
}

/**
 * ModalPhotoViewer renders a horizontally swipable, full-screen media viewer.
 * For photos, it uses a ScrollView (allowing pinch-to-zoom);
 * for videos, it renders the Video component with native controls.
 * Videos will auto-play when displayed.
 */
const ModalPhotoViewer = ({
  photos,
  initialIndex,
  onClose,
}: {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
}) => {
  const { width, height } = Dimensions.get('window');
  const [currentVisibleIndex, setCurrentVisibleIndex] = useState(initialIndex);

  // onViewableItemsChanged callback: update currentVisibleIndex when viewable items change.
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index?: number }> }) => {
      if (viewableItems && viewableItems.length > 0 && viewableItems[0].index !== undefined) {
        setCurrentVisibleIndex(viewableItems[0].index);
      }
    }
  ).current;

  // Configure viewability so that we consider an item "visible" when most of it is in view.
  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 95,
  }).current;

  return (
    <View style={styles.modalBackground}>
      <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
        <Text style={styles.modalCloseText}>Close</Text>
      </TouchableOpacity>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        initialScrollIndex={initialIndex}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_data, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) =>
          item.mediaType === 'video' ? (
            <Video
              source={{ uri: item.uri }}
              style={{ width, height }}
              useNativeControls
              isLooping
              shouldPlay={index === currentVisibleIndex}
            />
          ) : (
            <ScrollView
              maximumZoomScale={3}
              minimumZoomScale={1}
              contentContainerStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
            >
              <Image
                source={{ uri: item.uri }}
                style={{ width, height, resizeMode: 'contain' }}
              />
            </ScrollView>
          )
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
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
  videoIconOverlay: {
    position: 'absolute',
    top: 5,
    left: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    padding: 4,
  },
  videoIconText: {
    color: '#fff',
    fontSize: 14,
  },
  videoDurationOverlay: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoDurationText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
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
});
