import { useNavigate } from 'react-router-dom'

// Public page, reachable at /terms whether or not someone is logged in --
// linked from the last card of CommunityGuidelines.jsx. Reuses the existing
// .help-page / .help-section classes from index.css rather than introducing
// new styles.
export default function Terms() {
  const navigate = useNavigate()

  return (
    <div className="help-page" style={{ maxWidth: '720px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button onClick={() => navigate(-1)} aria-label="Go back" style={{ background: 'none', border: 'none', color: '#4ecca3', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem', flexShrink: 0 }}>&#8592;</button>
        <h1 style={{ margin: 0 }}>Terms of Use</h1>
      </div>
      <p style={{ color: '#8a8a8a', fontSize: '0.85rem', margin: '0.25rem 0 1.5rem' }}>Last updated: September 2026</p>

      <div className="help-section">
        <p>Welcome to Village Without Borders (VWB). This platform connects neighbors who need help with neighbors who can give it. We are a mutual aid community, not a charity or a government service. By using this app, you agree to the terms below.</p>
        <p>These terms exist to keep our community safe. Please read them carefully. If you have questions, reach out through the Help page in the app.</p>
      </div>

      <div className="help-section">
        <h2>1. Who can use this platform</h2>
        <p>You must be 18 years or older to create an account.</p>
        <p>You need a working email address to sign up. Your email is used only for account verification and important safety notifications. It is never shared with other members.</p>
        <p>You choose your own display name. It does not have to be your legal name. Your display name is visible to other members.</p>
      </div>

      <div className="help-section">
        <h2>2. What this platform is (and is not)</h2>
        <p>VWB is a space for neighbors to share skills, time, and resources with each other freely.</p>
        <p><strong>VWB is not:</strong></p>
        <ul>
          <li>A substitute for calling 911 or emergency services</li>
          <li>A background check service or identity verification system</li>
          <li>A guarantee that any help will be provided</li>
          <li>A marketplace, gig economy, or paid labor platform</li>
        </ul>
        <p>&quot;Verified&quot; on this platform means a member has confirmed a working email address. It does not mean we have verified their identity, skills, or background. Use your own judgment when accepting help or meeting someone in person.</p>
      </div>

      <div className="help-section">
        <h2>3. Roles and trust</h2>
        <p>Our community has a trust system with four levels:</p>
        <ul>
          <li><strong>Neighbor.</strong> Any verified member. Can post help requests, browse offers, and send messages.</li>
          <li><strong>Hope Ambassador.</strong> A neighbor who has applied to actively help others. An admin reviews and approves each application before Campfire access is granted.</li>
          <li><strong>Admin.</strong> A trusted member who helps manage the platform. Earned through an application process reviewed by existing leadership.</li>
          <li><strong>Founder.</strong> The creator and steward of VWB.</li>
        </ul>
        <p>Having a higher trust role does not grant anyone the right to demand personal information from you, pressure you into tasks, or override your boundaries.</p>
      </div>

      <div className="help-section">
        <h2>4. Protecting your personal information</h2>
        <p><strong>What is visible to other members:</strong></p>
        <ul>
          <li>Your display name</li>
          <li>Your avatar</li>
          <li>Skills you choose to list</li>
          <li>Your neighborhood (general area only)</li>
          <li>Your role (Neighbor, Hope Ambassador, Admin)</li>
          <li>Posts you make in public spaces (Campfire chat, help requests, offers)</li>
        </ul>
        <p><strong>What is never visible to other members:</strong></p>
        <ul>
          <li>Your email address</li>
          <li>Your precise location (even if you enable location features, coordinates are rounded for privacy)</li>
        </ul>
        <p><strong>Your responsibility:</strong></p>
        <p>Do not share personal information in public areas of the app. This includes Campfire (our group chat), help request descriptions, offer listings, community feed posts, and any other space visible to all members.</p>
        <p>Information you should keep out of public posts:</p>
        <ul>
          <li>Your home address or precise location</li>
          <li>Phone numbers</li>
          <li>Financial information (bank details, Venmo/CashApp handles, SSN)</li>
          <li>Government ID numbers</li>
          <li>Medical details</li>
          <li>Information about children, including names, schools, or photos</li>
          <li>Passwords or login credentials</li>
        </ul>
        <p>If you need to share sensitive details to coordinate help, do so only in private 1:1 messages with a specific person you have chosen to trust.</p>
        <p><strong>We are not responsible for information you voluntarily post in public areas of the app.</strong> Once something is posted publicly, other members may see it before it can be removed.</p>
      </div>

      <div className="help-section">
        <h2>5. Prohibited conduct</h2>
        <p>The following behaviors will result in immediate action, up to and including permanent removal from the platform:</p>

        <h3 style={{ fontSize: '0.95rem', margin: '1rem 0 0.4rem' }}>Predatory behavior</h3>
        <ul>
          <li>Targeting vulnerable people (those in crisis, experiencing homelessness, fleeing abuse, or in urgent need) for exploitation of any kind</li>
          <li>Using help requests or offers as a way to gain access to someone&apos;s home, belongings, children, or personal life for harmful purposes</li>
          <li>Pressuring any member for money, sexual favors, personal information, or anything beyond the scope of the help being offered or requested</li>
          <li>Grooming, manipulation, or building false trust in order to exploit someone later</li>
          <li>Recruiting members into schemes, scams, cults, or predatory organizations</li>
          <li>Catfishing or creating fake accounts to deceive other members</li>
        </ul>

        <h3 style={{ fontSize: '0.95rem', margin: '1rem 0 0.4rem' }}>Harassment and abuse</h3>
        <ul>
          <li>Threats of violence or intimidation</li>
          <li>Stalking, following, or monitoring another member&apos;s activity</li>
          <li>Hate speech, slurs, or discrimination based on race, gender, sexuality, disability, religion, immigration status, housing status, or any other identity</li>
          <li>Doxxing (sharing someone&apos;s private information without their consent)</li>
          <li>Continued unwanted contact after being asked to stop or being blocked</li>
          <li>Retaliating against someone who files a safety report</li>
        </ul>

        <h3 style={{ fontSize: '0.95rem', margin: '1rem 0 0.4rem' }}>Misuse of the platform</h3>
        <ul>
          <li>Using VWB to sell goods or services, run a business, or solicit paid work</li>
          <li>Posting false or misleading help requests</li>
          <li>Impersonating another member, admin, or organization</li>
          <li>Spamming, advertising, or promoting products in any public space</li>
          <li>Using the emergency events feature to spread false information</li>
          <li>Attempting to access another member&apos;s account or private data</li>
          <li>Circumventing blocks or bans by creating new accounts</li>
        </ul>

        <h3 style={{ fontSize: '0.95rem', margin: '1rem 0 0.4rem' }}>Misuse of trust roles</h3>
        <ul>
          <li>Hope Ambassadors, Admins, or any trusted member using their role to pressure, control, or take advantage of other members</li>
          <li>Admins accessing or sharing member information for any purpose outside of platform safety</li>
          <li>Using a trust role to build personal authority, recruit followers, or promote political campaigns or causes within the platform</li>
        </ul>
      </div>

      <div className="help-section">
        <h2>6. Safety tools</h2>
        <p>This platform is built on community trust, not constant moderation. Every member has safety tools in their own hands.</p>
        <p><strong>Blocking.</strong> You can block any member at any time. Blocking is mutual and immediate. Once you block someone, your conversations with them disappear from both sides. They cannot see your profile, send you messages, or interact with your posts. Because direct messages are end-to-end encrypted, we can&apos;t pull up or review a blocked conversation ourselves. If a safety concern is involved, you can attach your own copy of the messages when you file a report.</p>
        <p><strong>Reporting.</strong> You can report any message, post, or profile using the Report option in the app. You can also report someone you have already blocked. If something feels wrong, report it. You do not need to be sure a rule was broken.</p>
        <p><strong>Vouching.</strong> The vouch system lets members build a visible track record over time. Vouches from other members show that someone has a history of good interactions. They are not a guarantee, but they are a signal.</p>
        <p><strong>Consent before connection.</strong> Both sides must agree before any match or conversation happens. No one is connected to a stranger without saying yes first.</p>
        <p><strong>Retaliation against anyone who files a safety report is itself a violation of these terms and will be treated accordingly.</strong></p>
        <p>Reports are reviewed when action is needed. This platform does not have a full-time moderation team. We rely on the tools above and on members looking out for each other. When a report requires action beyond blocking, it will be handled by platform leadership, up to and including permanent removal.</p>
      </div>

      <div className="help-section">
        <h2>7. Content and communications</h2>
        <p>Everything you post in public spaces (Campfire, help requests, offers, the community feed) may be visible to all members.</p>
        <p>Direct messages between two people are end-to-end encrypted. That means only the two people in the conversation can ever read them, not admins, not the founder, not us. If you need to report something from a private conversation, you attach your own copy of the messages you&apos;re reporting, the same way you&apos;d forward a text message.</p>
        <p>Campfire (our group chat) works differently. It is not end-to-end encrypted, and admins can see what&apos;s posted there, so keep sensitive details out of it.</p>
        <p>You are responsible for what you post. Do not post content that is:</p>
        <ul>
          <li>Illegal</li>
          <li>Sexually explicit</li>
          <li>Violent or threatening</li>
          <li>Designed to deceive, manipulate, or cause panic</li>
          <li>A violation of someone else&apos;s privacy</li>
        </ul>
        <p>VWB reserves the right to remove any content that violates these terms.</p>
      </div>

      <div className="help-section">
        <h2>8. Emergency events</h2>
        <p>The emergency events feature is for real, time-sensitive community needs (severe weather, flooding, infrastructure failures, etc.).</p>
        <p>Do not use this feature to:</p>
        <ul>
          <li>Spread rumors or unverified information</li>
          <li>Create false emergencies</li>
          <li>Promote political events or campaigns</li>
        </ul>
        <p>Misuse of the emergency system is a serious violation and may result in immediate removal.</p>
      </div>

      <div className="help-section">
        <h2>9. No guarantees</h2>
        <p>VWB is run by volunteers. We do our best to maintain a safe and functional platform, but we cannot guarantee:</p>
        <ul>
          <li>That help will be available when you need it</li>
          <li>That any member is who they say they are</li>
          <li>That the platform will be available without interruption</li>
          <li>The quality, safety, or outcome of any help exchanged between members</li>
        </ul>
        <p>You use this platform at your own risk. VWB, its founder, admins, and volunteers are not liable for any harm, loss, or damage that results from interactions on or through this platform.</p>
      </div>

      <div className="help-section">
        <h2>10. Your account</h2>
        <p>You are responsible for keeping your login credentials secure. Do not share your account with others.</p>
        <p>To delete your account, contact us through the Help page in the app or at info@villagewithoutborders.org. When your account is deleted, your profile and associated data are removed from the platform. Some records (such as safety reports involving your account) may be retained for community safety purposes.</p>
        <p>VWB reserves the right to suspend or permanently remove any account that violates these terms.</p>
      </div>

      <div className="help-section">
        <h2>11. Changes to these terms</h2>
        <p>We may update these terms as the platform grows. When we do, we will note the date of the update at the top of this page. Continued use of the platform after changes are posted means you accept the updated terms.</p>
      </div>

      <div className="help-section">
        <h2>12. Governing law</h2>
        <p>This platform is operated from the state of Georgia, United States. Any disputes arising from these terms or your use of the platform will be governed by the laws of the state of Georgia.</p>
      </div>

      <div className="help-section">
        <h2>13. Contact</h2>
        <p>If you have questions about these terms, need to report a safety concern outside the app, or want to request your data, contact:</p>
        <p>
          <strong>Village Without Borders</strong><br />
          Email: <a href="mailto:info@villagewithoutborders.org">info@villagewithoutborders.org</a><br />
          Website: <a href="https://villagewithoutborders.org" target="_blank" rel="noopener noreferrer">villagewithoutborders.org</a>
        </p>
      </div>

      <p style={{ textAlign: 'center', color: '#8a8a8a', fontSize: '0.85rem', fontStyle: 'italic', margin: '1.5rem 0' }}>
        Village Without Borders is a mutual aid community. We believe in neighbors helping neighbors, freely and safely. These terms exist to protect that mission and every person who is part of it.
      </p>
    </div>
  )
}
