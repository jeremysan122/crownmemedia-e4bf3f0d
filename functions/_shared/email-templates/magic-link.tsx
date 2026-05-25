/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import { styles } from './_brand.ts'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your royal key to {siteName} awaits 👑</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.brandText}>👑 CrownMe</Text>
          <Text style={styles.brandTag}>Where Legends Reign</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Your royal key has arrived.</Heading>
          <Text style={styles.text}>
            Tap the seal below to return to <strong>{siteName}</strong>. This key
            expires soon — use it before it turns to dust.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Enter the Court
          </Button>
          <Text style={styles.signature}>— The CrownMe Court</Text>
          <Text style={styles.footer}>
            Didn't request this key? Ignore this scroll — your throne stays
            sealed.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
