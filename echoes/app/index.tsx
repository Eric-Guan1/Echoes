import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Image, StyleSheet, Alert } from 'react-native';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';

// Type definitions
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

      // Get recent photos from media library
      const mediaResult = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: 50,
      });

      // Fetch AssetInfo for each asset to get location metadata
      const photoPromises = mediaResult.assets.map(async (asset) => {
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
        if (assetInfo.location) {
          return {
            id: assetInfo.id,
            uri: assetInfo.localUri || assetInfo.uri,
            location: {
              latitude: assetInfo.location.latitude,
              longitude: assetInfo.location.longitude,
            },
          };
        }
        return null;
      });

      // Wait for all promises to resolve
      const resolvedPhotos = await Promise.all(photoPromises);

      // Filter only photos with location metadata near the current location
      const filteredPhotos = resolvedPhotos.filter(
        (photo) => photo && isSameLocation(photo.location, coords, 0.05)
      ) as Photo[];

      setPhotos(filteredPhotos);
    })();
  }, [visitedLocations]);

  async function sendNotification(message: string) {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Location Alert', body: message },
      trigger: null,
    });
  }

  // Compare two coordinates with a simple threshold
  function isSameLocation(a: Coords, b: Coords, threshold: number): boolean {
    return (
      Math.abs(a.latitude - b.latitude) < threshold &&
      Math.abs(a.longitude - b.longitude) < threshold
    );
  }

  // Format coordinates into a simple string representation
  function formatLocation(coords: Coords): string {
    return `Lat: ${coords.latitude}, Lon: ${coords.longitude}`;
  }

  const renderPhoto = ({ item }: { item: Photo }) => (
    <View style={styles.photoContainer}>
      <Text style={styles.locationText}>{formatLocation(item.location)}</Text>
      <Image source={{ uri: item.uri }} style={styles.image} />
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        {currentLocation ? `Current Location: ${formatLocation(currentLocation)}` : 'Fetching location...'}
      </Text>
      {photos.length === 0 ? (
        <Text style={styles.message}>No photos found for this location.</Text>
      ) : (
        <FlatList data={photos} renderItem={renderPhoto} keyExtractor={(item) => item.id} />
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
