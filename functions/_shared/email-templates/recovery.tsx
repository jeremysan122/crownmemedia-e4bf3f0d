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

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Restore your reign at {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.brandText}>👑 CrownMe</Text>
          <Text style={styles.brandTag}>Where Legends Reign</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Restore your reign.</Heading>
          <Text style={styles.text}>
            We received a request to reset your password for{' '}
            <strong>{siteName}</strong>. Tap the seal below to forge a new key
            to your throne.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Reset My Password
          </Button>
          <Text style={styles.signature}>— The CrownMe Court</Text>
          <Text style={styles.footer}>
            If you didn't request this, ignore this scroll. Your password
            remains untouched and your crown still yours.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail
