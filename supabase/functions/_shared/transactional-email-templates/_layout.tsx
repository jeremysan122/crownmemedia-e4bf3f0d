/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { HERO_BASE, heroImg, styles } from '../email-templates/_brand.ts'

export const SITE_NAME = 'CrownMe'
export const SITE_URL = 'https://crownmemedia.com'

interface CrownMeEmailProps {
  preview: string
  heroFile: string
  heroAlt: string
  heroHref?: string
  heading: string
  /** Body paragraphs, rendered in order. */
  paragraphs: React.ReactNode[]
  ctaLabel?: string
  ctaHref?: string
  footerNote?: string
}

export const CrownMeEmail = ({
  preview,
  heroFile,
  heroAlt,
  heroHref,
  heading,
  paragraphs,
  ctaLabel,
  ctaHref,
  footerNote,
}: CrownMeEmailProps) => {
  const hero = (
    <Img
      src={`${HERO_BASE}/${heroFile}`}
      alt={heroAlt}
      width="560"
      style={heroImg}
    />
  )
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={{ padding: 0, margin: 0 }}>
            {heroHref ? <Link href={heroHref}>{hero}</Link> : hero}
          </Section>
          <Section style={styles.body}>
            <Text style={styles.ornament}>✦ ♛ ✦</Text>
            <Text style={styles.overline}>{SITE_NAME}</Text>
            <Heading style={styles.h1}>{heading}</Heading>
            {paragraphs.map((p, i) => (
              <Text key={i} style={styles.text}>{p}</Text>
            ))}
            {ctaLabel && ctaHref && (
              <Section style={styles.buttonWrap}>
                <Button style={styles.button} href={ctaHref}>{ctaLabel}</Button>
              </Section>
            )}
            <Text style={styles.signature}>— The CrownMe Court —</Text>
            {footerNote && (
              <>
                <hr style={styles.hr} />
                <Text style={styles.footer}>{footerNote}</Text>
              </>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
