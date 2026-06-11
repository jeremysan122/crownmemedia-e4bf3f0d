import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import CrownLoader from "@/components/CrownLoader";

// Eager: critical first-paint routes
import Splash from "./pages/Splash";
import AgeGate from "./pages/AgeGate";
import VerifyAge from "./pages/VerifyAge";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Feed from "./pages/Feed";
import NotFound from "./pages/NotFound";
import CrownStolenBanner from "./components/CrownStolenBanner";
import PointerEventsGuard from "./components/PointerEventsGuard";
import NotificationToaster from "./components/NotificationToaster";

// Lazy: secondary user pages (load on demand, reduces TTI)
const Upload = lazy(() => import("./pages/Upload"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const CategoryLeaderboard = lazy(() => import("./pages/CategoryLeaderboard"));
const Profile = lazy(() => import("./pages/Profile"));
const CrownMap = lazy(() => import("./pages/CrownMap"));
const Battles = lazy(() => import("./pages/Battles"));
const BattleDetail = lazy(() => import("./pages/BattleDetail"));
const Messages = lazy(() => import("./pages/Messages"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Settings = lazy(() => import("./pages/Settings"));
const EditProfile = lazy(() => import("./pages/EditProfile"));
const Store = lazy(() => import("./pages/Store"));
const PurchaseSuccess = lazy(() => import("./pages/PurchaseSuccess"));
const Wallet = lazy(() => import("./pages/Wallet"));
const Insights = lazy(() => import("./pages/Insights"));
const RoyalPass = lazy(() => import("./pages/RoyalPass"));
const MyReports = lazy(() => import("./pages/MyReports"));
const BlockedAccounts = lazy(() => import("./pages/BlockedAccounts"));
const Preferences = lazy(() => import("./pages/Preferences"));
const MutedWords = lazy(() => import("./pages/MutedWords"));
const RestrictedAccounts = lazy(() => import("./pages/RestrictedAccounts"));
const AppealReport = lazy(() => import("./pages/AppealReport"));
const Invite = lazy(() => import("./pages/Invite"));
const Drafts = lazy(() => import("./pages/Drafts"));
const ArchivedPosts = lazy(() => import("./pages/ArchivedPosts"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const PostPage = lazy(() => import("./pages/PostPage"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const CreatorProgram = lazy(() => import("./pages/CreatorProgram"));
const AdminCreatorProgram = lazy(() => import("./pages/AdminCreatorProgram"));
const Scrolls = lazy(() => import("./pages/Shorts"));
const Rewards = lazy(() => import("./pages/Rewards"));
const RewardHistory = lazy(() => import("./pages/RewardHistory"));
const AdminRewards = lazy(() => import("./pages/AdminRewards"));
const AdminBroadcast = lazy(() => import("./pages/AdminBroadcast"));
const Verification = lazy(() => import("./pages/Verification"));
const AdminVerification = lazy(() => import("./pages/AdminVerification"));

// Lazy: admin (heavy, rarely used by regular users)
const Admin = lazy(() => import("./pages/Admin"));
const AdminBundles = lazy(() => import("./pages/AdminBundles"));
const AdminModeration = lazy(() => import("./pages/AdminModeration"));
const AdminVerify = lazy(() => import("./pages/AdminVerify"));
const AdminVotingVerify = lazy(() => import("./pages/AdminVotingVerify"));
const AdminAuditLog = lazy(() => import("./pages/AdminAuditLog"));
const AdminSystemAudit = lazy(() => import("./pages/AdminSystemAudit"));
const AdminRaceAudit = lazy(() => import("./pages/AdminRaceAudit"));
const CommandCenterLayout = lazy(() => import("./pages/admin/CommandCenterLayout"));
const CommandCenterOverview = lazy(() => import("./pages/admin/CommandCenterOverview"));
const CommandCenterRealtime = lazy(() => import("./pages/admin/CommandCenterRealtime"));
const CommandCenterSecurity = lazy(() => import("./pages/admin/CommandCenterSecurity"));
const CommandCenterFinance = lazy(() => import("./pages/admin/CommandCenterFinance"));
const CommandCenterStripeHealth = lazy(() => import("./pages/admin/CommandCenterStripeHealth"));
const CommandCenterDbHealth = lazy(() => import("./pages/admin/CommandCenterDbHealth"));
const CommandCenterCloudSpend = lazy(() => import("./pages/admin/CommandCenterCloudSpend"));
const CommandCenterUsers = lazy(() => import("./pages/admin/CommandCenterUsers"));
const CommandCenterContent = lazy(() => import("./pages/admin/CommandCenterContent"));
const CommandCenterBroadcasts = lazy(() => import("./pages/admin/CommandCenterBroadcasts"));
const CommandCenterSupport = lazy(() => import("./pages/admin/CommandCenterSupport"));
const CommandCenterSettings = lazy(() => import("./pages/admin/CommandCenterSettings"));
const CommandCenterAudit = lazy(() => import("./pages/admin/CommandCenterAudit"));
const CommandCenterReports = lazy(() => import("./pages/admin/CommandCenterReports"));
const CommandCenterErrorLogs = lazy(() => import("./pages/admin/CommandCenterErrorLogs"));
const CommandCenterFeatureFlags = lazy(() => import("./pages/admin/CommandCenterFeatureFlags"));

// Lazy: legal (long-form static pages)
const LegalCenter = lazy(() => import("./pages/legal/LegalCenter"));
const TermsOfService = lazy(() => import("./pages/legal/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/legal/PrivacyPolicy"));
const CommunityGuidelines = lazy(() => import("./pages/legal/CommunityGuidelines"));
const CookiePolicy = lazy(() => import("./pages/legal/CookiePolicy"));
const DmcaPolicy = lazy(() => import("./pages/legal/DmcaPolicy"));
const VirtualGoodsPolicy = lazy(() => import("./pages/legal/VirtualGoodsPolicy"));
const SubscriptionTerms = lazy(() => import("./pages/legal/SubscriptionTerms"));
const CsaePolicy = lazy(() => import("./pages/legal/CsaePolicy"));
const Eula = lazy(() => import("./pages/legal/Eula"));
const AcceptableUse = lazy(() => import("./pages/legal/AcceptableUse"));
const ContactLegal = lazy(() => import("./pages/legal/ContactLegal"));
const SensitiveContentPolicy = lazy(() => import("./pages/legal/SensitiveContentPolicy"));
const AccountLegal = lazy(() => import("./pages/AccountLegal"));
const SensitiveAppeal = lazy(() => import("./pages/SensitiveAppeal"));
const SensitiveAppealsList = lazy(() => import("./pages/SensitiveAppeal").then((m) => ({ default: m.SensitiveAppealsList })));
const AdminSensitiveAppeals = lazy(() => import("./pages/admin/AdminSensitiveAppeals"));
const ComplianceCheck = lazy(() => import("./pages/admin/ComplianceCheck"));
const CategoryHub = lazy(() => import("./pages/CategoryHub"));
const Discover = lazy(() => import("./pages/Discover"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories"));
import LegalConsentGate from "@/components/legal/LegalConsentGate";

// React Query: sensible defaults so tab switches don't blank-flash and
// background refetches don't dogpile the DB.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteFallback = () => <CrownLoader label="Loading…" />;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-center" theme="dark" />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <CrownStolenBanner />
          <PointerEventsGuard />
          <NotificationToaster />
          <Suspense fallback={<RouteFallback />}>
            <LegalConsentGate>
            <Routes>
              <Route path="/" element={<Splash />} />
              <Route path="/age-gate" element={<AgeGate />} />
              {/* /verify-age must NOT be wrapped in ProtectedRoute — that wrapper redirects
                  unconfirmed users here, which would cause a loop. The page itself checks auth. */}
              <Route path="/verify-age" element={<VerifyAge />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route path="/legal" element={<LegalCenter />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/conduct" element={<CommunityGuidelines />} />
              <Route path="/cookies" element={<CookiePolicy />} />
              <Route path="/dmca" element={<DmcaPolicy />} />
              <Route path="/virtual-goods" element={<VirtualGoodsPolicy />} />
              <Route path="/subscription-terms" element={<SubscriptionTerms />} />
              <Route path="/csae-policy" element={<CsaePolicy />} />
              <Route path="/eula" element={<Eula />} />
              <Route path="/acceptable-use" element={<AcceptableUse />} />
              <Route path="/contact-legal" element={<ContactLegal />} />
              <Route path="/sensitive-content" element={<SensitiveContentPolicy />} />

              <Route path="/feed" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
              <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
              <Route path="/shorts" element={<ProtectedRoute><Scrolls /></ProtectedRoute>} />
              <Route path="/scrolls" element={<ProtectedRoute><Scrolls /></ProtectedRoute>} />
              <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
              <Route path="/leaderboard/c/:mainSlug" element={<ProtectedRoute><CategoryLeaderboard /></ProtectedRoute>} />
              <Route path="/map" element={<ProtectedRoute><CrownMap /></ProtectedRoute>} />
              <Route path="/battles" element={<ProtectedRoute><Battles /></ProtectedRoute>} />
              <Route path="/battles/:id" element={<ProtectedRoute><BattleDetail /></ProtectedRoute>} />
              <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
              <Route path="/messages/:otherId" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/edit-profile" element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
              <Route path="/store" element={<ProtectedRoute><Store /></ProtectedRoute>} />
              <Route path="/store/success" element={<ProtectedRoute><PurchaseSuccess /></ProtectedRoute>} />
              <Route path="/wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
              <Route path="/royal-pass" element={<ProtectedRoute><RoyalPass /></ProtectedRoute>} />
              <Route path="/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><AdminRoute><Admin /></AdminRoute></ProtectedRoute>} />
              <Route path="/admin/bundles" element={<ProtectedRoute><AdminRoute><AdminBundles /></AdminRoute></ProtectedRoute>} />
              <Route path="/admin/moderation" element={<ProtectedRoute><AdminRoute><AdminModeration /></AdminRoute></ProtectedRoute>} />
              <Route path="/admin/verify" element={<ProtectedRoute><AdminRoute><AdminVerify /></AdminRoute></ProtectedRoute>} />
              <Route path="/admin/voting-verify" element={<ProtectedRoute><AdminRoute><AdminVotingVerify /></AdminRoute></ProtectedRoute>} />
              <Route path="/admin/audit-log" element={<ProtectedRoute><AdminRoute><AdminAuditLog /></AdminRoute></ProtectedRoute>} />
              <Route path="/admin/system-audit" element={<ProtectedRoute><AdminRoute><AdminSystemAudit /></AdminRoute></ProtectedRoute>} />
              <Route path="/admin/race-audit" element={<ProtectedRoute><AdminRoute><AdminRaceAudit /></AdminRoute></ProtectedRoute>} />
              <Route path="/admin/command-center" element={<ProtectedRoute><AdminRoute><CommandCenterLayout /></AdminRoute></ProtectedRoute>}>
                <Route index element={<CommandCenterOverview />} />
                <Route path="realtime" element={<CommandCenterRealtime />} />
                <Route path="security" element={<CommandCenterSecurity />} />
                <Route path="finance" element={<CommandCenterFinance />} />
                <Route path="stripe-health" element={<CommandCenterStripeHealth />} />
                <Route path="db-health" element={<CommandCenterDbHealth />} />
                <Route path="cloud-spend" element={<CommandCenterCloudSpend />} />
                <Route path="users" element={<CommandCenterUsers />} />
                <Route path="content" element={<CommandCenterContent />} />
                <Route path="reports" element={<CommandCenterReports />} />
                <Route path="broadcasts" element={<CommandCenterBroadcasts />} />
                <Route path="support" element={<CommandCenterSupport />} />
                <Route path="settings" element={<CommandCenterSettings />} />
                <Route path="audit" element={<CommandCenterAudit />} />
                <Route path="error-logs" element={<CommandCenterErrorLogs />} />
                <Route path="feature-flags" element={<CommandCenterFeatureFlags />} />
              </Route>
              <Route path="/me" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              {/* Public — anyone (including Google/bots) can view profiles and posts.
                  RLS on the DB already restricts private data; the component shows
                  a login prompt for actions that need auth (follow, vote, comment). */}
              <Route path="/u/:username" element={<Profile />} />
              <Route path="/post/:id" element={<PostPage />} />
              <Route path="/reports/mine" element={<ProtectedRoute><MyReports /></ProtectedRoute>} />
              <Route path="/blocked" element={<ProtectedRoute><BlockedAccounts /></ProtectedRoute>} />
              <Route path="/preferences" element={<ProtectedRoute><Preferences /></ProtectedRoute>} />
              <Route path="/muted-words" element={<ProtectedRoute><MutedWords /></ProtectedRoute>} />
              <Route path="/restricted" element={<ProtectedRoute><RestrictedAccounts /></ProtectedRoute>} />
              <Route path="/reports/:reportId/appeal" element={<ProtectedRoute><AppealReport /></ProtectedRoute>} />
              <Route path="/invite" element={<ProtectedRoute><Invite /></ProtectedRoute>} />
              <Route path="/drafts" element={<ProtectedRoute><Drafts /></ProtectedRoute>} />
              <Route path="/archived" element={<ProtectedRoute><ArchivedPosts /></ProtectedRoute>} />
              <Route path="/creator" element={<ProtectedRoute><CreatorProgram /></ProtectedRoute>} />
              <Route path="/admin/creator-program" element={<ProtectedRoute><AdminRoute><AdminCreatorProgram /></AdminRoute></ProtectedRoute>} />
              <Route path="/rewards" element={<ProtectedRoute><Rewards /></ProtectedRoute>} />
              <Route path="/rewards/history" element={<ProtectedRoute><RewardHistory /></ProtectedRoute>} />
              <Route path="/admin/rewards" element={<ProtectedRoute><AdminRoute><AdminRewards /></AdminRoute></ProtectedRoute>} />
              <Route path="/admin/broadcast" element={<ProtectedRoute><AdminRoute><AdminBroadcast /></AdminRoute></ProtectedRoute>} />
              <Route path="/verification" element={<ProtectedRoute><Verification /></ProtectedRoute>} />
              <Route path="/admin/verification" element={<ProtectedRoute><AdminRoute><AdminVerification /></AdminRoute></ProtectedRoute>} />

              <Route path="/account/legal" element={<ProtectedRoute><AccountLegal /></ProtectedRoute>} />
              <Route path="/appeals/sensitive" element={<ProtectedRoute><SensitiveAppealsList /></ProtectedRoute>} />
              <Route path="/appeals/sensitive/new" element={<ProtectedRoute><SensitiveAppeal /></ProtectedRoute>} />
              <Route path="/appeals/sensitive/new/:postId" element={<ProtectedRoute><SensitiveAppeal /></ProtectedRoute>} />
              <Route path="/admin/sensitive-appeals" element={<ProtectedRoute><AdminRoute><AdminSensitiveAppeals /></AdminRoute></ProtectedRoute>} />
              <Route path="/admin/compliance" element={<ProtectedRoute><AdminRoute><ComplianceCheck /></AdminRoute></ProtectedRoute>} />
              <Route path="/admin/categories" element={<ProtectedRoute><AdminRoute><AdminCategories /></AdminRoute></ProtectedRoute>} />

              <Route path="/discover" element={<ProtectedRoute><Discover /></ProtectedRoute>} />
              <Route path="/c/:mainSlug" element={<CategoryHub />} />
              <Route path="/c/:mainSlug/:subSlug" element={<CategoryHub />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
            </LegalConsentGate>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
