import { Stack } from "expo-router/stack";
import { View, StyleSheet, StatusBar, Platform, Image, Text } from "react-native";

function Padding() {
  return (
    <View style={styles.container}>
      <Image style={styles.image} source={require('../assets/images/logo.png')} />
      <Text style={styles.text}>echoes</Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <>
      {/* Ensure the status bar is visible */}
      <StatusBar barStyle="dark-content" />

      <Stack
        screenOptions={{
          headerTransparent: false, // Ensures header doesn't hide the status bar
          headerTitle: () => <Padding />,
          // headerTitleStyle: {
          //   marginTop: 100,
          //   padding: 100,
          // },
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  image: {
    width: 30,
    height: 30,
    resizeMode: "contain",
  },
  container: {
    flexDirection: 'row', // Align items in a row
    alignItems: 'left', // Center vertically
  },
  image: {
    width: 30,  // Adjust size as needed
    height: 30, // Adjust size as needed
    marginRight: 10, // Space between image and text
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333', // Adjust color as needed
  },
});
