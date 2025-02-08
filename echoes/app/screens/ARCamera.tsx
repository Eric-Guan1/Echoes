import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Dimensions, 
  Platform 
} from 'react-native';
// Keep your camera import as you had it.
import { Camera, CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Dummy data for photos – in a real app these would come from your saved assets.
const photos = [
  {
    id: '1',
    uri: 'https://via.placeholder.com/100',
    // Coordinates where the photo was taken
    location: { latitude: 37.78825, longitude: -122.4324 },
  },
  // Add more photos as needed.
];

export default function ARPhotoOverlay() {
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [heading, setHeading] = useState<number>(0);

  // Request camera and location permissions and get initial position.
  useEffect(() => {
    (async () => {
      const { status: camStatus } = await Camera.requestCameraPermissionsAsync();
      setHasCameraPermission(camStatus === 'granted');

      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      setHasLocationPermission(locStatus === 'granted');

      if (locStatus === 'granted') {
        // Get an initial location (optional, since we'll watch for changes)
        const loc = await Location.getCurrentPositionAsync({});
        setLocation(loc.coords);
      }
    })();
  }, []);

  // **NEW**: Continuously update location using watchPositionAsync.
  useEffect(() => {
    let locationSubscription: Location.LocationSubscription;
    if (hasLocationPermission) {
      (async () => {
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 10,      // update every 5 seconds
            distanceInterval: 0.01,     // or every 1 meter change
          },
          (loc) => {
            setLocation(loc.coords);
          }
        );
      })();
    }
    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [hasLocationPermission]);

  // Subscribe to the magnetometer (compass) updates.
  useEffect(() => {
    Magnetometer.setUpdateInterval(500);
    const subscription = Magnetometer.addListener((data) => {
      let angle = Math.atan2(data.y, data.x) * (180 / Math.PI);
      if (angle < 0) {
        angle += 360;
      }
      setHeading(angle);
    });
    return () => subscription && subscription.remove();
  }, []);

  // Given two coordinates, calculate the bearing (in degrees) from start to end.
  const calculateBearing = (
    start: Location.LocationObjectCoords, 
    end: { latitude: number; longitude: number }
  ): number => {
    const toRadians = (deg: number) => (deg * Math.PI) / 180;
    const toDegrees = (rad: number) => (rad * 180) / Math.PI;

    const startLat = toRadians(start.latitude);
    const startLon = toRadians(start.longitude);
    const endLat = toRadians(end.latitude);
    const endLon = toRadians(end.longitude);

    const dLon = endLon - startLon;
    const y = Math.sin(dLon) * Math.cos(endLat);
    const x =
      Math.cos(startLat) * Math.sin(endLat) -
      Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLon);
    let brng = toDegrees(Math.atan2(y, x));
    return (brng + 360) % 360;
  };

  // Render AR pins based on relative heading.
  const renderARPins = () => {
    if (!location) return null;
    return photos.map((photo) => {
      const photoBearing = calculateBearing(location, photo.location);
      let diff = photoBearing - heading;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;

      const maxAngle = 30;
      if (Math.abs(diff) > maxAngle) return null;

      const xPosition = (diff / maxAngle) * (SCREEN_WIDTH / 2) + SCREEN_WIDTH / 2;
      return (
        <View key={photo.id} style={[styles.pin, { left: xPosition }]}>
          <Text style={styles.pinText}>📸</Text>
        </View>
      );
    });
  };

  if (hasCameraPermission === null || hasLocationPermission === null) {
    return <View />;
  }
  if (!hasCameraPermission || !hasLocationPermission) {
    return <Text>No access to camera or location.</Text>;
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} >
        {renderARPins()}
        <View style={styles.debugInfo}>
          <Text style={styles.debugText}>Heading: {heading.toFixed(0)}°</Text>
          {location && (
            <Text style={styles.debugText}>
              Location: {location.latitude}, {location.longitude}
            </Text>
          )}
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  pin: {
    position: 'absolute',
    bottom: 150,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinText: {
    fontSize: 24,
    color: '#fff',
  },
  debugInfo: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 10,
  },
  debugText: {
    color: '#fff',
    fontSize: 14,
  },
});
