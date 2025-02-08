import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

//Import Screens
import GalleryScreen from '../screens/GalleryScreen';
import MapScreen from '../screens/MapScreen';

//Stack Navigator for screens
const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

//Bottom Tab Navigator
function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          // Explicitly type `iconName`
          let iconName: keyof typeof Ionicons.glyphMap; 

          if (route.name === 'Gallery') {
            iconName = 'images';  // Ensures only valid icon names are used
          } else if (route.name === 'Map') {
            iconName = 'map'; 
          } else {
            iconName = 'help-circle'; // Default fallback to avoid undefined
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Gallery" component={GalleryScreen} />
      <Tab.Screen name="Map" component={MapScreen} />
    </Tab.Navigator>
  );
}

//Main Navigation Container
export default function Navigator() {
  return (
    <NavigationContainer>
      <TabNavigator />
    </NavigationContainer>
  );
}
