import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import { Magnetometer } from 'expo-sensors';

const CAMERA_HORIZONTAL_FOV = 60; // Update this based on your device's actual camera FOV

// Helpers to convert between degrees and radians
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

// Bearing calculation remains the same
function computeBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  let brng = Math.atan2(y, x);
  return (toDeg(brng) + 360) % 360;
}

// Distance calculation remains the same
function computeDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

type PhotoMarker = {
  id: string;
  uri: string;
  latitude: number;
  longitude: number;
  distance: number;
  bearing: number;
};

export default function ARScreen() {
  // ... existing state declarations ...

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);
  const [hasMediaPermission, setHasMediaPermission] = useState<boolean | null>(null);
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [photos, setPhotos] = useState<PhotoMarker[]>([]);
  const [heading, setHeading] = useState<number>(0);

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  const HEADING_OFFSET = 0; // Adjusted based on corrected magnetometer calculation

  useEffect(() => {
    const subscription = Magnetometer.addListener((data) => {
      let { x, y } = data;
      // Corrected heading calculation
      let angle = Math.atan2(x, y) * (180 / Math.PI); // Swapped x and y
      if (angle < 0) angle += 360;
      setHeading(angle);
    });
    Magnetometer.setUpdateInterval(100);
    return () => subscription.remove();
  }, []);

  const renderMarkers = () => {
    if (!location) return null;

    const adjustedHeading = (heading + HEADING_OFFSET) % 360;

    return photos.map((photo) => {
      let angleDiff = photo.bearing - adjustedHeading;
      angleDiff = ((angleDiff + 180) % 360) - 180;

      if (Math.abs(angleDiff) > CAMERA_HORIZONTAL_FOV / 2) return null;

      // Calculate horizontal position
      const x = ((angleDiff + CAMERA_HORIZONTAL_FOV / 2) / CAMERA_HORIZONTAL_FOV) * screenWidth;
      
      // Calculate vertical position (adjust this value based on your needs)
      const y = screenHeight * 0.75;

      // Add depth scaling based on distance
      const scale = Math.min(1, 30 / photo.distance); // Scale down distant markers

      return (
        <TouchableOpacity
          key={photo.id}
          style={[
            styles.marker,
            { 
              left: x - 25,
              top: y - 25,
              transform: [{ scale }],
            }
          ]}
        >
          <Image source={{ uri: photo.uri }} style={styles.markerImage} />
        </TouchableOpacity>
      );
    });
  };

  // ... rest of the component remains the same ...
  if (
    hasCameraPermission === false ||
    hasLocationPermission === false ||
    hasMediaPermission === false
  ) {
    return (
      <View style={styles.centered}>
        <Text>No access to camera, location, or media library</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Live camera preview */}
      <CameraView style={StyleSheet.absoluteFillObject} >
      
      {/* AR overlay: Photo markers */}
      {renderMarkers()}

      {/* Simple compass display */}
      <View style={styles.compassContainer}>
        <Text style={styles.compassText}>Heading: {Math.round(heading)}°</Text>
      </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marker: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    borderColor: 'white',
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: '#00000080',
  },
  markerImage: {
    width: '100%',
    height: '100%',
  },
  compassContainer: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  compassText: {
    color: 'white',
    fontSize: 16,
  },
});
