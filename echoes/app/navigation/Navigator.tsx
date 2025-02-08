import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

// Import Screens
import GalleryScreen from '../screens/GalleryScreen';
import MapScreen from '../screens/MapScreen';
import ARCamera from '../screens/ARCamera';

// Bottom Tab Navigator
const Tab = createBottomTabNavigator();

export default function Navigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'help-circle';
          if (route.name === 'Gallery') iconName = 'images';
          if (route.name === 'Map') iconName = 'map';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Gallery" component={GalleryScreen} />
      <Tab.Screen name="AR" component={ARCamera} />
      <Tab.Screen name="Map" component={MapScreen} />
    </Tab.Navigator>
  );
}
