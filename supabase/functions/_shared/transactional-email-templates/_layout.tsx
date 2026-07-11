/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { HERO_BASE, heroImg, styles } from '../email-templates/_brand.ts'

export const SITE_NAME = 'CrownMe'
export const SITE_URL = 'https://crownmemedia.com'
const SITE_DOMAIN = 'crownmemedia.com'
const TAGLINE = 'Where Legends Reign'

interface CrownMeEmailProps {
  preview: string
  heroFile: string
  heroAlt: string
  heroHref?: string
  heading: string
  paragraphs: React.ReactNode[]
  ctaLabel?: string
  ctaHref?: string
  footerNote?: string
}

// Split the heading so the last word renders in italic gold, matching the
// "You Won the Crown" reference (final word emphasized).
const splitHeading = (heading: string): [string, string | null] => {
  const trimmed = heading.replace(/\.$/, '').trim()
  const parts = trimmed.split(/\s+/)
  if (parts.length < 2) return [heading, null]
  const last = parts.pop() as string
  return [parts.join(' ') + ' ', last]
}

const Divider = () => (
  <table role="presentation" cellPadding={0} cellSpacing={0} style={styles.dividerRow}>
    <tbody>
      <tr>
        <td style={styles.dividerLine as React.CSSProperties} />
        <td style={styles.dividerGem}>◆</td>
        <td style={styles.dividerLine as React.CSSProperties} />
      </tr>
    </tbody>
  </table>
)

const DarkFooter = () => (
  <Section style={styles.darkFooter}>
    <table role="presentation" cellPadding={0} cellSpacing={0} width="100%" style={styles.darkFooterRow}>
      <tbody>
        <tr>
          <td style={styles.darkFooterIcon}>✦</td>
          <td style={styles.darkFooterDomain}>{SITE_DOMAIN}</td>
          <td style={styles.darkFooterIcon}>♛</td>
        </tr>
      </tbody>
    </table>
    <div style={styles.darkFooterDivider} />
    <Text style={styles.darkFooterTag}>— {TAGLINE} —</Text>
  </Section>
)

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
  const [headLead, headAccent] = splitHeading(heading)
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
            <Divider />
            <Heading style={styles.h1}>
              {headLead}
              {headAccent && <span style={styles.h1Accent}>{headAccent}</span>}
            </Heading>
            <Divider />
            {paragraphs.map((p, i) => (
              <Text key={i} style={styles.text}>{p}</Text>
            ))}
            {ctaLabel && ctaHref && (
              <Section style={styles.buttonWrap}>
                <Button style={styles.button} href={ctaHref}>
                  <span style={styles.buttonCrown}>♛</span>
                  {ctaLabel}
                  <span style={styles.buttonCrown}>♛</span>
                </Button>
              </Section>
            )}
            <Text style={styles.miniCrown}>♛</Text>
            <Text style={styles.signature}>— The CrownMe Court —</Text>
            {footerNote && (
              <Text style={styles.footerNote}>{footerNote}</Text>
            )}
          </Section>
          <DarkFooter />
        </Container>
      </Body>
    </Html>
  )
}
