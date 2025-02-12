# Echoes

# Inspiration
The inspiration was our desire to help others reimagine what it means to capture and relive your memories. Oftentimes, we forget good memories that we had in certain locations. This is even more difficult for the elderly, where memories can fade over time and the physical details of certain places become increasingly obscured. We recognize that these memories are treasures that should be preserved, and with Echoes, we aim to help.

# What it does
Echoes is a memory-sharing app with a built-in augmented reality (AR) component to it. It enhances how we interact with our nearby surroundings by linking digital memories from past years to real-world locations. Here are some of our core functionalities:

- Using our app, users can see a gallery of photos they have taken within a certain radius of their current location
- When users arrive at a previously visited place, they receive a notification that allows them to revisit their memories
- Users can explore a map of all of their memories. Furthermore, they can tap on the map pins, revealing the specific photos/videos they took in a specific location
- Imagine standing in your childhood home and seeing photos from your past appear in AR. With Echoes, users can seamlessly relive their captured moments, overlaid in the real world.

# How we built it
We built it using React Native and Expo. Many of the features, like the map, gallery, and camera are from the Expo API. Because Expo does not support AR at all, we were forced to implement it ourselves. We did this using the user’s location and heading along with the photo’s location to map the photo to the correct part of the screen, like in AR.

# What's next for Echoes
We plan to make Echoes a social app. Users can create an account and make friends with each other. Then, people can see what their friends post. This means that you can walk through a certain location and see what your friends took a picture of. We think that this is useful because you can see how your story on a trip differed from your friends.
