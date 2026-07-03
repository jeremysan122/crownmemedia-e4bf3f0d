import { useParams, useSearchParams } from "react-router-dom";
import {
  FeedScreen, BattleScreen, LeaderboardScreen, ProfileScreen, StoreScreen,
  NotificationsScreen, MapScreen, CameraScreen, MessagesScreen, SettingsScreen, AdminScreen,
} from "@/marketing/screens";

const SCREENS: Record<string, React.ComponentType<{ variant: "mobile" | "tablet" | "desktop" }>> = {
  feed: FeedScreen,
  battle: BattleScreen,
  leaderboard: LeaderboardScreen,
  profile: ProfileScreen,
  store: StoreScreen,
  notifications: NotificationsScreen,
  map: MapScreen,
  camera: CameraScreen,
  messages: MessagesScreen,
  settings: SettingsScreen,
  admin: AdminScreen,
};

const SIZES = {
  mobile: { w: 390, h: 844 },
  tablet: { w: 1024, h: 1366 },
  desktop: { w: 1440, h: 900 },
};

export default function Marketing() {
  const { screen = "feed" } = useParams();
  const [sp] = useSearchParams();
  const variant = (sp.get("v") || "mobile") as "mobile" | "tablet" | "desktop";
  const Comp = SCREENS[screen] || FeedScreen;
  const { w, h } = SIZES[variant];
  return (
    <div style={{ background: "#000", minHeight: "100vh", padding: 0, margin: 0 }}>
      <div
        id="marketing-frame"
        style={{
          width: w,
          height: h,
          overflow: "hidden",
          position: "relative",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <Comp variant={variant} />
      </div>
    </div>
  );
}
