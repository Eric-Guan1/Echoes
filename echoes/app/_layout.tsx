import { Stack } from "expo-router/stack";
import { View, StyleSheet, StatusBar, Image, Text } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';


const Logo = () => (
  <Svg width="30" height="30" viewBox="0 0 50 50">
    <Defs>
      <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#007AFF" />
        <Stop offset="100%" stopColor="#34C759" />
      </LinearGradient>
    </Defs>
    {/* Circular background with a gradient fill */}
    <Circle cx="25" cy="25" r="25" fill="url(#grad)" />
    {/* The letter "e" centered in the circle */}
    <SvgText
      x="25"
      y="33"
      fill="#FFF"
      fontSize="24"
      fontWeight="bold"
      textAnchor="middle"
    >
      e
    </SvgText>
  </Svg>
);

function HeaderTitle() {
  return (
    <View style={styles.headerContainer}>
      {/* <Logo /> */}
      <Image
        style={styles.logo}
        source={require("../assets/images/logo1.png")}
      />
      <Text style={styles.title}>echoes</Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <>
      {/* Ensure the status bar is visible with dark content */}
      <StatusBar barStyle="dark-content" />
      <Stack
        screenOptions={{
          headerTransparent: false, // Header is opaque
          headerTitle: () => <HeaderTitle />,
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    width: 30,
    height: 30,
    resizeMode: "contain",
    marginRight: 0, // A touch of space between the logo and text
  },
  title: {
    marginLeft: 3,
    fontSize: 24,
    fontWeight: "700",
    color: "#1D1D1F", // A refined, dark tone for crisp legibility
  },
});
