import React, { useState, useEffect } from 'react';
import { useNavigation } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Image,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';

const CAMERA_HORIZONTAL_FOV = 60;
const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

// Adjust these thresholds as needed.
const LOCATION_THRESHOLD = 0.05; // for filtering photos with valid location metadata
const CLOSE_BY_DISTANCE = 25; // in meters: photos within this range will appear in the "close by" list

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

function computeBearing(lat1: number, long1: number, lat2: number, long2: number): number {
  const radLat1 = toRad(lat1);
  const radLong1 = toRad(long1);
  const radLat2 = toRad(lat2);
  const radLong2 = toRad(long2);

  const y = Math.sin(radLong2 - radLong1) * Math.cos(radLat2);
  const x =
    Math.cos(radLat1) * Math.sin(radLat2) -
    Math.sin(radLat1) * Math.cos(radLat2) * Math.cos(radLong2 - radLong1);
  let bearing = Math.atan2(y, x);
  bearing = toDeg(bearing);
  bearing = (bearing + 360) % 360;
  return bearing;
}

function computeDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isSameLocation(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
  threshold: number
): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < threshold &&
    Math.abs(a.longitude - b.longitude) < threshold
  );
}

type PhotoMarker = {
  id: string;
  uri: string;
  latitude: number;
  longitude: number;
};

export default function ARScreen() {
  const [hasPermissions, setHasPermissions] = useState({
    camera: false,
    location: false,
    media: false,
  });
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [photos, setPhotos] = useState<PhotoMarker[]>([]);
  const [heading, setHeading] = useState(0);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoMarker | null>(null);
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({ headerShown: false }); // Remove the title
  }, [navigation]);

  // Request permissions and load photos once.
  useEffect(() => {
    const requestPermissions = async () => {
      const [camera, loc, media] = await Promise.all([
        Camera.requestCameraPermissionsAsync(),
        Location.requestForegroundPermissionsAsync(),
        MediaLibrary.requestPermissionsAsync(),
      ]);

      setHasPermissions({
        camera: camera.status === 'granted',
        location: loc.status === 'granted',
        media: media.status === 'granted',
      });

      if (loc.status === 'granted') {
        const { coords } = await Location.getCurrentPositionAsync({});
        setLocation(coords);

        const mediaResult = await MediaLibrary.getAssetsAsync({
          mediaType: 'photo',
          first: 100,
        });

        const photosWithLocation = await Promise.all(
          mediaResult.assets.map(async (asset) => {
            const info = await MediaLibrary.getAssetInfoAsync(asset.id);
            if (!info.location) return null;
            return {
              id: asset.id,
              uri: info.localUri || asset.uri,
              latitude: info.location.latitude,
              longitude: info.location.longitude,
            };
          })
        );
        setPhotos(photosWithLocation.filter((p): p is PhotoMarker => p !== null));
      }
    };

    requestPermissions();
  }, []);

  // Continually update the heading.
  useEffect(() => {
    let headingSubscription: Location.LocationSubscription | null = null;
    const subscribeToHeading = async () => {
      headingSubscription = await Location.watchHeadingAsync((headingData) => {
        const newHeading = headingData.magHeading ?? headingData.trueHeading;
        setHeading(newHeading);
      });
    };
    subscribeToHeading();

    return () => {
      headingSubscription && headingSubscription.remove();
    };
  }, []);

  // Continually update the location.
  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;
    const subscribeToLocation = async () => {
      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 0,
        },
        (loc) => {
          setLocation(loc.coords);
        }
      );
    };
    subscribeToLocation();

    return () => {
      locationSubscription && locationSubscription.remove();
    };
  }, []);

  // Render AR markers for photos that are not "close by".
  const renderMarkers = () => {
    if (!location) return null;

    return photos.map((photo) => {
      // Filter out photos that do not have sufficiently similar location metadata.
      if (
        !isSameLocation(
          { latitude: location.latitude, longitude: location.longitude },
          { latitude: photo.latitude, longitude: photo.longitude },
          LOCATION_THRESHOLD
        )
      ) {
        return null;
      }

      const dynamicDistance = computeDistance(
        location.latitude,
        location.longitude,
        photo.latitude,
        photo.longitude
      );

      // Do not render as AR marker if the photo is "close by".
      if (dynamicDistance < CLOSE_BY_DISTANCE) return null;

      const dynamicBearing = computeBearing(
        location.latitude,
        location.longitude,
        photo.latitude,
        photo.longitude
      );

      // Normalize the angle difference to the range [-180, 180]
      const angleDiff = ((dynamicBearing - heading + 540) % 360) - 180;

      // Only render photos that are within the camera's horizontal field of view.
      if (Math.abs(angleDiff) > CAMERA_HORIZONTAL_FOV / 2) return null;

      // Compute horizontal position based on the angle difference.
      const xPos =
        ((angleDiff + CAMERA_HORIZONTAL_FOV / 2) / CAMERA_HORIZONTAL_FOV) * SCREEN_WIDTH;
      // Vertically center the marker.
      const yPos = SCREEN_HEIGHT / 2 - 25;
      // Optionally adjust the scale based on distance.
      const scale = Math.min(1.5, 50 / Math.max(dynamicDistance, 1));

      return (
        <TouchableOpacity
          key={photo.id}
          style={[
            styles.markerContainer,
            {
              left: xPos - 25,
              top: yPos,
              transform: [{ scale }, { perspective: 1000 }],
            },
          ]}
          onPress={() => setSelectedPhoto(photo)}
          activeOpacity={0.8}
        >
          <Text style={styles.markerDistanceText}>{Math.round(dynamicDistance)} m</Text>
          <View style={styles.marker}>
            <Image source={{ uri: photo.uri }} style={styles.markerImage} />
          </View>
        </TouchableOpacity>
      );
    });
  };

  // Filter photos that are close by (within CLOSE_BY_DISTANCE).
  const closeByPhotos = location
    ? photos.filter(
        (photo) =>
          computeDistance(
            location.latitude,
            location.longitude,
            photo.latitude,
            photo.longitude
          ) < CLOSE_BY_DISTANCE
      )
    : [];

  if (Object.values(hasPermissions).some((status) => status === false)) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Required permissions not granted</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera}>
        {renderMarkers()}
        <View style={styles.compassContainer}>
          <Text style={styles.compassText}>{Math.round(heading)}°</Text>
        </View>
      </CameraView>

      {/* "Close By" Photos List */}
      {closeByPhotos.length > 0 && (
        <View style={styles.closeByContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {closeByPhotos.map((photo) => (
              <TouchableOpacity
                key={photo.id}
                onPress={() => setSelectedPhoto(photo)}
                style={styles.closeByItem}
                activeOpacity={0.8}
              >
                <Image source={{ uri: photo.uri }} style={styles.closeByPhoto} />
                <Text style={styles.closeByDistanceText}>
                  {Math.round(
                    computeDistance(
                      location!.latitude,
                      location!.longitude,
                      photo.latitude,
                      photo.longitude
                    )
                  )}{' '}
                  m
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Modal to display selected photo */}
      {selectedPhoto && (
        <Modal visible={true} transparent animationType="fade">
          <TouchableOpacity
            style={styles.modalContainer}
            onPress={() => setSelectedPhoto(null)}
            activeOpacity={1}
          >
            <Image
              source={{ uri: selectedPhoto.uri }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000', // Ensures a clean, dark background
  },
  camera: {
    flex: 1,
  },
  centered: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  markerContainer: {
    position: 'absolute',
    alignItems: 'center',
    // A subtle shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: Platform.OS === 'android' ? 0.5 : 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  markerDistanceText: {
    color: '#fff',
    fontSize: 12,
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  marker: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#fff',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    overflow: 'hidden',
  },
  markerImage: {
    width: '100%',
    height: '100%',
  },
  compassContainer: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 15,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  compassText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginVertical: 2,
  },
  closeByContainer: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    paddingHorizontal: 15,
  },
  closeByItem: {
    alignItems: 'center',
    marginRight: 15,
  },
  closeByPhoto: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fff',
  },
  closeByDistanceText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 6,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImage: {
    width: SCREEN_WIDTH * 0.95,
    height: SCREEN_HEIGHT * 0.95,
  },
});

export { ARScreen };
