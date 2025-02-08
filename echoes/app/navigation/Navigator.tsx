import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import MapScreen from './screens/MapScreen';
import GalleryScreen from './screens/GalleryScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={MapScreen} />
        <Stack.Screen name="Gallery" component={GalleryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
