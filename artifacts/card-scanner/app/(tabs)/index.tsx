import { Redirect } from "expo-router";

// The tab group has no standalone home screen — the camera (Scan) tab is the
// entry point. This route exists so "/" resolves to a real screen in the
// static web export; it immediately forwards to the Scan tab.
export default function TabsIndex() {
  return <Redirect href="/camera" />;
}
