/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import { HERO_BASE, heroImg, styles } from './_brand.ts'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Claim your throne — confirm your CrownMe email 👑</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={{ padding: 0, margin: 0 }}>
          <Link href={confirmationUrl}>
            <Img
              src={`${HERO_BASE}/7e065d5a-5acb-4807-94f6-8406859cc51e/crownme-confirm-signup-hero.jpg`}
              alt="CrownMe — Where Legends Reign"
              width="560"
              style={heroImg}
            />
          </Link>
        </Section>
        <Section style={styles.body}>
          <Text style={styles.ornament}>✦ ♛ ✦</Text>
          <Text style={styles.overline}>{siteName}</Text>
          <Heading style={styles.h1}>Claim your throne, royal.</Heading>
          <Text style={styles.text}>
            Welcome to{' '}
            <Link href={siteUrl} style={styles.link}>
              <strong>{siteName}</strong>
            </Link>
            . Your crown awaits — but first, let's confirm{' '}
            <Link href={`mailto:${recipient}`} style={styles.link}>
              {recipient}
            </Link>
            .
          </Text>
          <Section style={styles.buttonWrap}>
            <Button style={styles.button} href={confirmationUrl}>
              Verify & Enter the Court
            </Button>
          </Section>
          <Text style={styles.signature}>— The CrownMe Court —</Text>
          <hr style={styles.hr} />
          <Text style={styles.footer}>
            If you didn't create a CrownMe account, you can safely ignore this
            email. No crown will be issued in your name.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
