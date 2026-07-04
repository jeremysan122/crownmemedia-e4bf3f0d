import LegalShell, { H2, H3, P, UL } from "@/components/legal/LegalShell";

export default function SensitiveContentPolicy() {
  return (
    <LegalShell
      title="Sensitive Content Policy"
      effectiveDate="June 2, 2026"
      lastUpdated="July 4, 2026"
      version="1.2"
      shellTitle="Sensitive Content"
      pdfSlug="crownme-sensitive-content"
      seoDescription="How CrownMe Media labels, blurs, gates, moderates and audits sensitive content across Feed, Profile, Post, Scrolls, Crown Map, Leaderboard, and Share Cards."
    >
      <P>
        This Sensitive Content Policy ("Policy") supplements our{" "}
        <a className="underline text-primary" href="/terms">Terms of Service</a>,{" "}
        <a className="underline text-primary" href="/conduct">Community Guidelines</a>, and{" "}
        <a className="underline text-primary" href="/acceptable-use">Acceptable Use Policy</a>.
        It explains how CrownMe Media classifies, blurs, gates, moderates, and audits
        content that may be sensitive, and the rights and responsibilities of authors,
        viewers, and moderators. CrownMe Media is an 18+ platform; this Policy is not a
        license to post sexually explicit material, which remains prohibited.
      </P>

      <H2>1. Definitions</H2>
      <UL>
        <li>
          <strong>Content Rating</strong> — one of <code>safe</code>,{" "}
          <code>suggestive</code>, <code>mature</code>, or <code>explicit</code>. Only
          moderators may set a post to <code>explicit</code>; authors may self-classify up
          to <code>mature</code>.
        </li>
        <li>
          <strong>Sensitive Post</strong> — any post flagged <code>is_sensitive = true</code>{" "}
          by the author, an automated classifier, or a moderator, or any post with a rating
          of <code>suggestive</code> or higher.
        </li>
        <li>
          <strong>Moderation Status</strong> — one of <code>pending</code>,{" "}
          <code>approved</code>, <code>flagged</code>, or <code>removed</code>. Set and
          changed only by moderators.
        </li>
        <li>
          <strong>Viewer Preference</strong> — your Content Filter setting in{" "}
          Settings → Preferences (<em>Show</em>, <em>Blur</em>, or <em>Hide</em>).
        </li>
        <li>
          <strong>Age Eligibility</strong> — confirmed 18+ status established at
          registration and re-confirmable on demand.
        </li>
      </UL>

      <H2>2. Eligibility &amp; Age Gating</H2>
      <P>
        Sensitive content is never displayed to anyone who has not confirmed they are at
        least 18 years old. Logged-out visitors, users who have not completed age
        verification, and users whose age eligibility has been revoked will see sensitive
        content as <strong>blurred or hidden</strong> regardless of any other setting, and
        cannot bypass that state through share links, embeds, deep links, or API calls.
      </P>

      <H2>3. Default Visibility Rules</H2>
      <P>The system applies, in order:</P>
      <UL>
        <li>
          <strong>Moderation status wins.</strong> Posts that are <code>removed</code>,{" "}
          <code>flagged</code>, or <code>pending</code> are never shown to the public via
          sensitive-content logic. Removed posts cannot reappear through any feature,
          including share cards, leaderboard previews, or Crown Map pins.
        </li>
        <li>
          <strong>Eligibility check.</strong> Unverified or under-18 viewers always see a
          blocking blur with no reveal control.
        </li>
        <li>
          <strong>Viewer preference.</strong> Eligible viewers see sensitive posts according
          to their Content Filter: <em>Show</em> renders normally, <em>Blur</em> requires a
          tap-to-reveal confirmation, <em>Hide</em> removes the post from the surface.
        </li>
        <li>
          <strong>Author / Admin view.</strong> Authors may always see their own posts
          unblurred. Moderators may unblur in admin surfaces for review purposes only;
          public surfaces remain governed by the rules above.
        </li>
      </UL>

      <H2>4. Surfaces Covered</H2>
      <P>
        The same rules apply consistently on Feed, Profile, Post Detail, Scrolls/Shorts,
        Crown Map, Leaderboard previews, Share Cards, search results, notifications, and
        any embed or open-graph preview. Share cards never expose unblurred sensitive
        media when the rules above require blur or hide.
      </P>

      <H2>5. Author Responsibilities</H2>
      <UL>
        <li>Truthfully classify your own content; do not down-rate to evade filters.</li>
        <li>
          You may not un-mark <code>is_sensitive</code> or lower the rating of a post once
          a moderator has set or confirmed it.
        </li>
        <li>
          Sexually explicit content, CSAE, non-consensual intimate imagery, and other
          prohibited categories are <strong>not</strong> permitted at any rating and will
          be removed under our{" "}
          <a className="underline text-primary" href="/acceptable-use">Acceptable Use Policy</a> and{" "}
          <a className="underline text-primary" href="/csae-policy">CSAE Policy</a>.
        </li>
      </UL>

      <H2>6. Moderator Tools &amp; Permissions</H2>
      <P>
        Only users with the <code>admin</code> or <code>moderator</code> role may change{" "}
        <code>content_rating</code>, <code>moderation_status</code>,{" "}
        <code>is_sensitive</code> (after upload), or set a post to <code>explicit</code>.
        Database-level Row Level Security and validation triggers enforce these limits;
        regular users cannot modify these fields through the app, API, or direct database
        calls. Bulk actions (approve, flag, unflag, remove) require explicit confirmation
        and are processed in batches.
      </P>

      <H2>7. Audit Logging</H2>
      <P>
        Every moderation change — including old and new values, the acting moderator's
        ID, and the timestamp — is written to a tamper-resistant{" "}
        <code>admin_audit_log</code>. The log is visible only to admins and moderators and
        is filterable by actor, post, field, and date range, and exportable to CSV for
        compliance, regulator response, and internal review.
      </P>

      <H2>8. Viewer Controls</H2>
      <P>
        You may change your Content Filter at any time in Settings → Preferences. You may
        also re-confirm or revoke age eligibility, report a post for re-review, or block
        an author. CrownMe Media does not use sensitive-content classifications to
        personalize advertising.
      </P>

      <H2>9. Appeals</H2>
      <P>
        If your post is rated, flagged, or removed and you believe the decision is
        incorrect, submit an appeal from the post menu or via{" "}
        <a className="underline text-primary" href="mailto:appeals@crownmemedia.com">
          appeals@crownmemedia.com
        </a>
        . Appeals are reviewed by a moderator who did not make the original decision where
        operationally feasible. EU users have additional rights under the Digital Services
        Act, including out-of-court dispute settlement.
      </P>

      <H2>10. Data Handled by This System</H2>
      <UL>
        <li>Post fields: <code>is_sensitive</code>, <code>sensitive_reason</code>, <code>content_rating</code>, <code>moderation_status</code>, <code>moderation_notes</code>, <code>moderated_by</code>, <code>moderated_at</code>.</li>
        <li>Viewer fields: Content Filter preference, age-eligibility confirmation timestamp.</li>
        <li>Audit entries retained for the lifetime of the post and a reasonable period thereafter for legal, safety, and regulator response.</li>
      </UL>
      <P>
        See our <a className="underline text-primary" href="/privacy">Privacy Policy</a>{" "}
        for the lawful bases, retention, and your rights of access, correction, deletion,
        and portability.
      </P>

      <H2>11. Changes</H2>
      <P>
        We may update this Policy as the product evolves. Material changes will be
        announced in-app or by email before they take effect. The current version and
        effective date are shown at the top of this page.
      </P>

      <H2>12. Contact</H2>
      <P>
        Questions or reports:{" "}
        <a className="underline text-primary" href="mailto:safety@crownmemedia.com">safety@crownmemedia.com</a>{" "}
        ·{" "}
        <a className="underline text-primary" href="mailto:legal@crownmemedia.com">legal@crownmemedia.com</a>.
      </P>
    </LegalShell>
  );
}
