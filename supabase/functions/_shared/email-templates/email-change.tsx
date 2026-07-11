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

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email change for {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={{ padding: 0, margin: 0 }}>
          <Link href={confirmationUrl}>
            <Img
              src={`${HERO_BASE}/f51ba113-49fa-4bd1-9c24-70fa0e3d5fab/crownme-email-change-hero.jpg`}
              alt="CrownMe — Confirm your new address"
              width="560"
              style={heroImg}
            />
          </Link>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Confirm your new address.</Heading>
          <Text style={styles.text}>
            You requested to update your <strong>{siteName}</strong> email from{' '}
            <Link href={`mailto:${oldEmail}`} style={styles.link}>
              {oldEmail}
            </Link>{' '}
            to{' '}
            <Link href={`mailto:${newEmail}`} style={styles.link}>
              {newEmail}
            </Link>
            .
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Confirm Email Change
          </Button>
          <Text style={styles.signature}>— The CrownMe Court</Text>
          <Text style={styles.footer}>
            If you didn't request this change, secure your account immediately —
            your crown may be at risk.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
