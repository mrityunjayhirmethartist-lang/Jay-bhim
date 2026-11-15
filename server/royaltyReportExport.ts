import PDFDocument from 'pdfkit';
import { MonthlyRoyalty, TrackRoyalty } from '../src/types';

export interface RoyaltyExportMeta {
  artistName: string;
  artistEmail: string;
  scopeLabel: string;
  statusFilter: string;
  generatedAtIso: string;
}

export function filterMonthlyRoyalties(
  records: MonthlyRoyalty[],
  options: {
    month?: string;
    fromMonth?: string;
    toMonth?: string;
    status?: string;
  }
): MonthlyRoyalty[] {
  const cleanMonth = (options.month || '').trim();
  const cleanFrom = (options.fromMonth || '').trim();
  const cleanTo = (options.toMonth || '').trim();
  const cleanStatus = (options.status || '').trim();

  return records
    .filter((item) => {
      if (cleanMonth && item.month !== cleanMonth) return false;
      if (cleanFrom && item.month < cleanFrom) return false;
      if (cleanTo && item.month > cleanTo) return false;
      if (cleanStatus && cleanStatus.toLowerCase() !== 'all' && item.status.toLowerCase() !== cleanStatus.toLowerCase()) {
        return false;
      }
      return true;
    })
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month));
}

function escapeCsvCell(value: string | number | undefined | null): string {
  const str = value === undefined || value === null ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

function formatInrPlain(amount: number): string {
  return Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatCount(count: number): string {
  return Math.round(Number(count || 0)).toLocaleString('en-IN');
}

export function generateRoyaltyCsv(records: MonthlyRoyalty[]): string {
  const headers = [
    'Statement ID',
    'Month Code',
    'Reporting Cycle',
    'Status',
    'Verified Streams',
    'Gross Royalty (INR)',
    'Artist Net Share (INR)',
    'Avg RPM (INR)',
    'Spotify (INR)',
    'Apple Music (INR)',
    'YouTube Music (INR)',
    'JioSaavn (INR)',
    'Amazon Music (INR)',
    'Other DSPs (INR)',
    'Settlement Date'
  ];

  const rows = records.map((r) => {
    const rpm = r.streams > 0 ? (r.netRoyalty / r.streams) * 1000 : 0;
    return [
      r.statementId,
      r.month,
      r.monthLabel,
      r.status,
      r.streams,
      r.grossRoyalty.toFixed(2),
      r.netRoyalty.toFixed(2),
      rpm.toFixed(2),
      r.spotify.toFixed(2),
      r.appleMusic.toFixed(2),
      r.youtubeMusic.toFixed(2),
      r.jioSaavn.toFixed(2),
      r.amazonMusic.toFixed(2),
      r.otherDSPs.toFixed(2),
      r.payoutDate || 'In Clearance Pipeline'
    ];
  });

  if (records.length > 0) {
    const totals = records.reduce(
      (acc, r) => {
        acc.streams += r.streams || 0;
        acc.gross += r.grossRoyalty || 0;
        acc.net += r.netRoyalty || 0;
        acc.spotify += r.spotify || 0;
        acc.apple += r.appleMusic || 0;
        acc.youtube += r.youtubeMusic || 0;
        acc.jio += r.jioSaavn || 0;
        acc.amazon += r.amazonMusic || 0;
        acc.other += r.otherDSPs || 0;
        return acc;
      },
      { streams: 0, gross: 0, net: 0, spotify: 0, apple: 0, youtube: 0, jio: 0, amazon: 0, other: 0 }
    );
    const totalRpm = totals.streams > 0 ? (totals.net / totals.streams) * 1000 : 0;
    rows.push([
      'SUMMARY TOTAL',
      '',
      `${records.length} Month(s)`,
      '',
      totals.streams,
      totals.gross.toFixed(2),
      totals.net.toFixed(2),
      totalRpm.toFixed(2),
      totals.spotify.toFixed(2),
      totals.apple.toFixed(2),
      totals.youtube.toFixed(2),
      totals.jio.toFixed(2),
      totals.amazon.toFixed(2),
      totals.other.toFixed(2),
      ''
    ]);
  }

  return [headers.map(escapeCsvCell).join(','), ...rows.map((row) => row.map(escapeCsvCell).join(','))].join('\n');
}

export async function generateRoyaltyPdfBuffer(
  records: MonthlyRoyalty[],
  topTracks: TrackRoyalty[],
  meta: RoyaltyExportMeta
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true,
        info: {
          Title: `Rudraatma Music Royalty Summary - ${meta.scopeLabel}`,
          Author: 'Rudraatma Music Distribution',
          Subject: 'Monthly Royalty Earnings Summary'
        }
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageLeft = 40;
      const pageWidth = 515; // A4 (595) - 2 * 40

      // Brand Header Banner
      doc.save();
      doc.roundedRect(pageLeft, 36, pageWidth, 82, 8).fill('#0b1329');
      doc.fillColor('#f59e0b').font('Helvetica-Bold').fontSize(9).text('RUDRAATMA MUSIC DISTRIBUTION', pageLeft + 18, 48, {
        characterSpacing: 1.5
      });
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(17).text('Monthly Royalty Earnings Summary', pageLeft + 18, 63);
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(8.5).text(
        `Account: ${meta.artistName} (${meta.artistEmail})   |   Period: ${meta.scopeLabel}   |   Status: ${meta.statusFilter}`,
        pageLeft + 18,
        88,
        { width: pageWidth - 36 }
      );
      doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text(
        `Generated UTC: ${meta.generatedAtIso.replace('T', ' ').slice(0, 19)}   |   100% Artist Keep Accounting`,
        pageLeft + 18,
        102
      );
      doc.restore();

      const totals = records.reduce(
        (acc, r) => {
          acc.streams += r.streams || 0;
          acc.gross += r.grossRoyalty || 0;
          acc.net += r.netRoyalty || 0;
          if (r.status === 'Cleared') acc.cleared += r.netRoyalty || 0;
          else acc.pending += r.netRoyalty || 0;
          acc.spotify += r.spotify || 0;
          acc.apple += r.appleMusic || 0;
          acc.youtube += r.youtubeMusic || 0;
          acc.jio += r.jioSaavn || 0;
          acc.amazon += r.amazonMusic || 0;
          acc.other += r.otherDSPs || 0;
          return acc;
        },
        {
          streams: 0,
          gross: 0,
          net: 0,
          cleared: 0,
          pending: 0,
          spotify: 0,
          apple: 0,
          youtube: 0,
          jio: 0,
          amazon: 0,
          other: 0
        }
      );

      const avgRpm = totals.streams > 0 ? (totals.net / totals.streams) * 1000 : 0;

      // 4 Executive Summary Cards
      const cardsY = 132;
      const cardGap = 9;
      const cardWidth = (pageWidth - cardGap * 3) / 4;
      const cardData = [
        { label: 'NET ARTIST EARNINGS', value: `INR ${formatInrPlain(totals.net)}`, sub: `${records.length} reporting cycle(s)`, accent: '#10b981' },
        { label: 'GROSS ROYALTY POOL', value: `INR ${formatInrPlain(totals.gross)}`, sub: 'DSP reported revenue', accent: '#38bdf8' },
        { label: 'VERIFIED STREAMS', value: formatCount(totals.streams), sub: `Avg RPM: INR ${avgRpm.toFixed(2)}`, accent: '#f59e0b' },
        { label: 'CLEARED / PENDING', value: `INR ${formatInrPlain(totals.cleared)}`, sub: `Pending: INR ${formatInrPlain(totals.pending)}`, accent: '#a855f7' }
      ];

      cardData.forEach((card, idx) => {
        const cx = pageLeft + idx * (cardWidth + cardGap);
        doc.save();
        doc.roundedRect(cx, cardsY, cardWidth, 58, 6).fill('#f8fafc').strokeColor('#cbd5e1').lineWidth(0.8).stroke();
        doc.rect(cx, cardsY, cardWidth, 3).fill(card.accent);
        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(6.8).text(card.label, cx + 8, cardsY + 10, { width: cardWidth - 16 });
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10.5).text(card.value, cx + 8, cardsY + 23, { width: cardWidth - 16 });
        doc.fillColor('#64748b').font('Helvetica').fontSize(7).text(card.sub, cx + 8, cardsY + 41, { width: cardWidth - 16 });
        doc.restore();
      });

      let y = cardsY + 74;

      // Section 1: Monthly Statements Table
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('Monthly Royalty Statement Breakdown', pageLeft, y);
      y += 18;

      const cols = [
        { title: 'Period', width: 62, align: 'left' as const },
        { title: 'Statement Ref', width: 96, align: 'left' as const },
        { title: 'Status', width: 68, align: 'left' as const },
        { title: 'Streams', width: 62, align: 'right' as const },
        { title: 'Gross (INR)', width: 76, align: 'right' as const },
        { title: 'Net Artist (INR)', width: 79, align: 'right' as const },
        { title: 'Settlement', width: 72, align: 'right' as const }
      ];

      const drawMonthlyTableHeader = (startY: number) => {
        doc.save();
        doc.rect(pageLeft, startY, pageWidth, 22).fill('#0f172a');
        let x = pageLeft + 6;
        doc.fillColor('#f8fafc').font('Helvetica-Bold').fontSize(7.5);
        cols.forEach((col, i) => {
          const w = col.width - (i === 0 ? 6 : i === cols.length - 1 ? 6 : 4);
          doc.text(col.title, x, startY + 7, { width: w, align: col.align });
          x += col.width;
        });
        doc.restore();
        return startY + 22;
      };

      y = drawMonthlyTableHeader(y);

      if (records.length === 0) {
        doc.save();
        doc.rect(pageLeft, y, pageWidth, 34).fill('#f8fafc').strokeColor('#e2e8f0').stroke();
        doc.fillColor('#64748b').font('Helvetica').fontSize(8.5).text(
          'No royalty statements match the selected period or settlement status filter.',
          pageLeft + 10,
          y + 12,
          { width: pageWidth - 20, align: 'center' }
        );
        doc.restore();
        y += 42;
      } else {
        records.forEach((r, idx) => {
          if (y > 745) {
            doc.addPage();
            y = drawMonthlyTableHeader(44);
          }

          doc.save();
          if (idx % 2 === 1) {
            doc.rect(pageLeft, y, pageWidth, 20).fill('#f8fafc');
          }
          doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(pageLeft, y + 20).lineTo(pageLeft + pageWidth, y + 20).stroke();

          const cells = [
            r.monthLabel,
            r.statementId,
            r.status,
            formatCount(r.streams),
            formatInrPlain(r.grossRoyalty),
            formatInrPlain(r.netRoyalty),
            r.payoutDate || 'Pending'
          ];

          let x = pageLeft + 6;
          cells.forEach((val, i) => {
            const col = cols[i];
            const w = col.width - (i === 0 ? 6 : i === cols.length - 1 ? 6 : 4);
            doc.fillColor(i === 5 ? '#047857' : i === 2 && r.status === 'Cleared' ? '#047857' : '#1e293b')
              .font(i === 5 || i === 0 ? 'Helvetica-Bold' : 'Helvetica')
              .fontSize(7.8)
              .text(val, x, y + 6, { width: w, align: col.align });
            x += col.width;
          });
          doc.restore();
          y += 20;
        });

        // Summary Total Row
        if (y > 745) {
          doc.addPage();
          y = 44;
        }
        doc.save();
        doc.rect(pageLeft, y, pageWidth, 22).fill('#e2e8f0');
        const totalCells = [
          'TOTAL',
          `${records.length} cycle(s)`,
          '',
          formatCount(totals.streams),
          formatInrPlain(totals.gross),
          formatInrPlain(totals.net),
          ''
        ];
        let x = pageLeft + 6;
        totalCells.forEach((val, i) => {
          const col = cols[i];
          const w = col.width - (i === 0 ? 6 : i === cols.length - 1 ? 6 : 4);
          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8).text(val, x, y + 7, { width: w, align: col.align });
          x += col.width;
        });
        doc.restore();
        y += 34;
      }

      // Section 2: DSP Channel Breakdown for Selected Period
      if (records.length > 0) {
        if (y > 620) {
          doc.addPage();
          y = 44;
        }
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('DSP Revenue Share Breakdown (Selected Period)', pageLeft, y);
        y += 16;

        const dspRows = [
          { name: 'Spotify', amount: totals.spotify },
          { name: 'Apple Music', amount: totals.apple },
          { name: 'YouTube Music & Content ID', amount: totals.youtube },
          { name: 'JioSaavn', amount: totals.jio },
          { name: 'Amazon Music', amount: totals.amazon },
          { name: 'Wynk & Other DSPs', amount: totals.other }
        ];
        const dspTotal = dspRows.reduce((s, d) => s + d.amount, 0) || totals.net || 1;

        doc.save();
        doc.rect(pageLeft, y, pageWidth, 20).fill('#0f172a');
        doc.fillColor('#f8fafc').font('Helvetica-Bold').fontSize(7.5);
        doc.text('Digital Service Provider (DSP)', pageLeft + 8, y + 6, { width: 250 });
        doc.text('Earnings (INR)', pageLeft + 260, y + 6, { width: 130, align: 'right' });
        doc.text('Revenue Share (%)', pageLeft + 395, y + 6, { width: 112, align: 'right' });
        doc.restore();
        y += 20;

        dspRows.forEach((dsp, idx) => {
          doc.save();
          if (idx % 2 === 1) doc.rect(pageLeft, y, pageWidth, 18).fill('#f8fafc');
          doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(pageLeft, y + 18).lineTo(pageLeft + pageWidth, y + 18).stroke();
          const pct = ((dsp.amount / dspTotal) * 100).toFixed(1);
          doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(7.8).text(dsp.name, pageLeft + 8, y + 5, { width: 250 });
          doc.fillColor('#0f172a').font('Helvetica').fontSize(7.8).text(formatInrPlain(dsp.amount), pageLeft + 260, y + 5, { width: 130, align: 'right' });
          doc.fillColor('#0369a1').font('Helvetica-Bold').fontSize(7.8).text(`${pct}%`, pageLeft + 395, y + 5, { width: 112, align: 'right' });
          doc.restore();
          y += 18;
        });

        y += 20;
      }

      // Section 3: Catalog Top Tracks Reference (if available)
      if (topTracks && topTracks.length > 0) {
        if (y > 650) {
          doc.addPage();
          y = 44;
        }
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('Catalog Top Tracks Overview', pageLeft, y);
        y += 16;

        doc.save();
        doc.rect(pageLeft, y, pageWidth, 20).fill('#0f172a');
        doc.fillColor('#f8fafc').font('Helvetica-Bold').fontSize(7.5);
        doc.text('Track Title', pageLeft + 8, y + 6, { width: 185 });
        doc.text('Primary DSP', pageLeft + 195, y + 6, { width: 110 });
        doc.text('Verified Streams', pageLeft + 310, y + 6, { width: 95, align: 'right' });
        doc.text('Royalties (INR)', pageLeft + 410, y + 6, { width: 97, align: 'right' });
        doc.restore();
        y += 20;

        topTracks.slice(0, 8).forEach((trk, idx) => {
          doc.save();
          if (idx % 2 === 1) doc.rect(pageLeft, y, pageWidth, 18).fill('#f8fafc');
          doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(pageLeft, y + 18).lineTo(pageLeft + pageWidth, y + 18).stroke();
          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.8).text(trk.title, pageLeft + 8, y + 5, { width: 185 });
          doc.fillColor('#475569').font('Helvetica').fontSize(7.8).text(trk.topPlatform, pageLeft + 195, y + 5, { width: 110 });
          doc.fillColor('#1e293b').font('Helvetica').fontSize(7.8).text(formatCount(trk.streams), pageLeft + 310, y + 5, { width: 95, align: 'right' });
          doc.fillColor('#047857').font('Helvetica-Bold').fontSize(7.8).text(formatInrPlain(trk.royalties), pageLeft + 410, y + 5, { width: 97, align: 'right' });
          doc.restore();
          y += 18;
        });
      }

      // Page Footers
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.save();
        doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(pageLeft, 795).lineTo(pageLeft + pageWidth, 795).stroke();
        doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text(
          'Rudraatma Music Distribution | Official Royalty Accounting Statement | support@rudraatmamusic.com',
          pageLeft,
          802,
          { width: 390 }
        );
        doc.text(`Page ${i + 1} of ${range.count}`, pageLeft + 400, 802, { width: 115, align: 'right' });
        doc.restore();
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
