import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Alert, Image, TouchableOpacity, Modal } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';

// Type Definitions
type Coords = { latitude: number; longitude: number };
type Photo = { id: string; uri: string; location: Coords };

export default function MapScreen() {
  const [currentLocation, setCurrentLocation] = useState<Region | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null); // Stores tapped photo
  const [modalVisible, setModalVisible] = useState(false); // Controls full-screen modal

  useEffect(() => {
    (async () => {
      // Request location permission
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      if (locStatus !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required.');
        setLoading(false);
        return;
      }

      // Request media library permission
      const { status: mediaStatus } = await MediaLibrary.requestPermissionsAsync();
      if (mediaStatus !== 'granted') {
        Alert.alert('Permission denied', 'Media library access is required.');
        setLoading(false);
        return;
      }

      // Get current location
      const locResult = await Location.getCurrentPositionAsync({});
      const coords = locResult.coords;
      setCurrentLocation({
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.05, // Default zoom level
        longitudeDelta: 0.05,
      });

      // Load photos from the gallery
      await loadPhotos();
      setLoading(false);
    })();
  }, []);

  /**
   * Loads photos from the media library and filters those with location data.
   */
  async function loadPhotos() {
    try {
      const mediaResult = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: 50, // Fetch up to 50 photos
      });

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

      const resolvedPhotos = (await Promise.all(photoPromises)).filter(Boolean) as Photo[];
      setPhotos(resolvedPhotos);
    } catch (error) {
      console.error('Error loading photos:', error);
    }
  }

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map View */}
      <MapView
        style={styles.map}
        initialRegion={currentLocation || {
          latitude: 37.7749, // Default to San Francisco if location is unavailable
          longitude: -122.4194,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation={true}
      >
        {photos.map((photo) => (
          <Marker
            key={photo.id}
            coordinate={{ latitude: photo.location.latitude, longitude: photo.location.longitude }}
            onPress={() => setSelectedPhoto(photo)}
          />
        ))}
      </MapView>

      {/* Photo Preview (Shows when a marker is tapped) */}
      {selectedPhoto && (
        <View style={styles.previewContainer}>
          <TouchableOpacity onPress={() => setModalVisible(true)}>
            <Image source={{ uri: selectedPhoto.uri }} style={styles.previewImage} />
          </TouchableOpacity>
        </View>
      )}

      {/* Full-Screen Image Modal */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={styles.modalContainer}>
          <TouchableOpacity style={styles.closeButton} onPress={() => setModalVisible(false)}>
            <Image source={{ uri: selectedPhoto?.uri }} style={styles.fullImage} />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  // Loader
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Photo Preview (small image)
  previewContainer: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  previewImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
  },

  // Full-Screen Modal
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '90%',
    height: '90%',
    resizeMode: 'contain',
  },
});