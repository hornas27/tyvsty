// Ty vs. Ty – PDF report (jsPDF, načítá se až při exportu).
(function () {
  const C = { ink: [20, 26, 46], soft: [86, 96, 121], line: [220, 225, 235], bg: [238, 241, 246], clay: [255, 107, 74], clayL: [255, 231, 224], sage: [31, 59, 255], sageL: [228, 233, 255], good: [17, 128, 74], bad: [194, 52, 26] };
  const W = 210, H = 297, M = 14, CW = W - 2 * M;
  const nf = (v, d) => v == null || !isFinite(v) ? "—" : Number(v).toLocaleString("cs-CZ", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });

  async function b64(url) {
    const buf = await (await fetch(url)).arrayBuffer();
    let s = ""; const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  let fonts = null;
  async function addFonts(doc) {
    if (!fonts) fonts = await Promise.all([b64("fonts/DejaVuSans.ttf"), b64("fonts/DejaVuSans-Bold.ttf")]);
    doc.addFileToVFS("DV.ttf", fonts[0]); doc.addFont("DV.ttf", "DV", "normal");
    doc.addFileToVFS("DVB.ttf", fonts[1]); doc.addFont("DVB.ttf", "DV", "bold");
  }

  function build(data) {
    return (async () => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
      await addFonts(doc);
      const col = (c, t) => t === "f" ? doc.setFillColor(...c) : t === "d" ? doc.setDrawColor(...c) : doc.setTextColor(...c);
      const font = (sz, bold, c) => { doc.setFont("DV", bold ? "bold" : "normal"); doc.setFontSize(sz); col(c || C.ink); };
      let y = M, page = 1;
      const footer = () => { font(7.5, false, C.soft); doc.text("Ty vs. Ty · " + data.fromTxt + " – " + data.toTxt, M, H - 8); doc.text(String(page), W - M, H - 8, { align: "right" }); };
      const newPage = () => { footer(); doc.addPage(); page++; y = M; };
      const need = h => { if (y + h > H - 16) newPage(); };
      const section = t => { need(14); font(8, true, C.soft); doc.text(t.toUpperCase(), M, y + 4, { charSpace: 0.6 }); y += 8; };

      // --- hlavička ---
      col(C.clay, "f"); doc.roundedRect(M, y, 9, 9, 2, 2, "F");
      col([255, 255, 255], "f"); [[2, 5], [4, 3.5], [6, 2]].forEach(([dx, hh]) => doc.rect(M + dx + 0.2, y + 7 - hh, 1.3, hh, "F"));
      font(20, true); doc.text("Ty vs. Ty", M + 12, y + 7.2);
      font(9, false, C.soft); doc.text("Report " + data.fromTxt + " – " + data.toTxt + " · " + data.days.length + " dní", M + 12, y + 12.5);
      doc.text("Vytvořeno " + data.generated, W - M, y + 12.5, { align: "right" });
      y += 19; col(C.line, "d"); doc.setLineWidth(0.3); doc.line(M, y, W - M, y); y += 6;

      // --- souhrn ---
      const s = data.summary, st = data.settings;
      const wCh = s.wStart != null && s.wEnd != null ? s.wEnd - s.wStart : null;
      const boxes = [
        ["Váha", s.wEnd != null ? nf(s.wEnd, 1) + " kg" : "—", wCh != null ? (wCh >= 0 ? "+" : "") + nf(wCh, 1) + " kg za období" : ""],
        ["Průměr 7 dní (konec)", s.wAvgEnd != null ? nf(s.wAvgEnd, 1) + " kg" : "—", "cíl " + nf(st.targetWeight, 0) + " kg"],
        ["Kalorie Ø", s.kcal != null ? nf(s.kcal) + " kcal" : "—", "cíl " + nf(st.kcalTarget) + " · splněno " + s.kcalHit + "/" + s.kcalN],
        ["Bílkoviny Ø", s.protein != null ? nf(s.protein) + " g" : "—", data.proteinTarget ? "cíl " + data.proteinTarget + " g" : ""],
        ["Spánek Ø", s.sleep != null ? nf(s.sleep, 1) + " h" : "—", "cíl " + nf(st.sleepTarget, 1) + " h"],
        ["Tréninky", s.trained + " / " + s.planned, s.chill ? "+ " + s.chill + "× chill run" : "plánované dny"],
        ["Návyky", s.habPct != null ? s.habPct + " %" : "—", "série " + s.streak + " · rekord " + s.best],
        ["Energie Ø", s.energy != null ? nf(s.energy, 1) + " / 5" : "—", ""]
      ];
      const bw = (CW - 3 * 4) / 4, bh = 19;
      boxes.forEach((b, i) => {
        const x = M + (i % 4) * (bw + 4), yy = y + Math.floor(i / 4) * (bh + 4);
        col(C.bg, "f"); doc.roundedRect(x, yy, bw, bh, 2.5, 2.5, "F");
        font(7.5, false, C.soft); doc.text(b[0], x + 3.5, yy + 5);
        font(12.5, true); doc.text(b[1], x + 3.5, yy + 11.5);
        font(6.8, false, C.soft); doc.text(doc.splitTextToSize(b[2], bw - 6)[0] || "", x + 3.5, yy + 16);
      });
      y += 2 * bh + 4 + 8;

      // --- grafy ---
      const days = data.days, n = days.length;
      function frame(x, yy, w, h, lo, hi, ticks, fmt) {
        font(6.5, false, C.soft); col(C.line, "d"); doc.setLineWidth(0.2);
        for (let i = 0; i <= ticks; i++) {
          const v = lo + (hi - lo) * i / ticks, py = yy + h - (h * i / ticks);
          doc.line(x, py, x + w, py); doc.text(fmt(v), x - 1.5, py + 1, { align: "right" });
        }
        const step = Math.max(1, Math.ceil(n / 8));
        days.forEach((d, i) => { if (i % step === 0 || (i === n - 1 && (n - 1) % step >= step / 2)) doc.text(d.short, x + (n === 1 ? w / 2 : w * i / (n - 1)), yy + h + 4, { align: "center" }); });
      }
      function weightChart(x, yy, w, h) {
        const vals = days.flatMap(d => [d.weight, d.avg7]).filter(v => v != null);
        if (!vals.length) { font(9, false, C.soft); doc.text("Žádné vážení v tomto období.", x, yy + 8); return; }
        let lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
        if (hi - lo < 2) hi = lo + 2;
        let tk = hi - lo, dec = 0;
        if (tk > 8) { const st2 = Math.ceil(tk / 6); lo = Math.floor(lo / st2) * st2; hi = Math.ceil(hi / st2) * st2; tk = (hi - lo) / st2; }
        frame(x, yy, w, h, lo, hi, tk, v => nf(v, dec));
        const px = i => x + (n === 1 ? w / 2 : w * i / (n - 1)), py = v => yy + h - (v - lo) / (hi - lo) * h;
        col(C.clay, "d"); doc.setLineWidth(0.7);
        let prev = null; days.forEach((d, i) => { if (d.avg7 == null) { prev = null; return; } const p = [px(i), py(d.avg7)]; if (prev) doc.line(prev[0], prev[1], p[0], p[1]); prev = p; });
        col(C.sage, "f"); days.forEach((d, i) => { if (d.weight != null) doc.circle(px(i), py(d.weight), 0.75, "F"); });
        font(7, false, C.soft); col(C.sage, "f"); doc.circle(x + w - 46, yy - 3, 0.9, "F"); doc.text("ranní váha", x + w - 44, yy - 2.2);
        col(C.clay, "d"); doc.line(x + w - 24, yy - 3, x + w - 20, yy - 3); doc.text("Ø 7 dní", x + w - 18.5, yy - 2.2);
      }
      function barChart(x, yy, w, h, key, target, color, unit) {
        const vals = days.map(d => d[key]).filter(v => v != null);
        if (!vals.length) { font(9, false, C.soft); doc.text("Bez dat.", x, yy + 8); return; }
        const raw = Math.max(target || 0, ...vals) * 1.08, lo = 0;
        const p10 = Math.pow(10, Math.floor(Math.log10(raw / 3))), stp = [1, 2, 2.5, 5, 10].map(m => m * p10).find(v => raw / v <= 4.5);
        const hi = Math.ceil(raw / stp) * stp;
        frame(x, yy, w, h, lo, hi, Math.round(hi / stp), v => nf(v, 0));
        const slot = w / n, bwid = Math.max(0.6, Math.min(5, slot * 0.62));
        days.forEach((d, i) => {
          if (d[key] == null) return;
          const cx = x + (n === 1 ? w / 2 : w * i / (n - 1)), bh2 = d[key] / hi * h;
          col(target && d[key] >= target ? color : C.line, "f");
          doc.rect(cx - bwid / 2, yy + h - bh2, bwid, bh2, "F");
        });
        if (target) { const ty = yy + h - target / hi * h; col(C.ink, "d"); doc.setLineWidth(0.3); doc.setLineDashPattern([1, 1], 0); doc.line(x, ty, x + w, ty); doc.setLineDashPattern([], 0); font(6.5, false, C.ink); const lt = "cíl " + nf(target) + " " + unit, lw = doc.getTextWidth(lt); col([255, 255, 255], "f"); doc.rect(x + w - lw - 1.5, ty - 3.6, lw + 1.5, 2.9, "F"); doc.text(lt, x + w, ty - 1, { align: "right" }); }
      }
      section("Váha");
      weightChart(M + 9, y + 4, CW - 9, 44); y += 56;
      need(52);
      font(8, true, C.soft);
      doc.text("KALORIE", M, y + 4, { charSpace: 0.6 }); doc.text("BÍLKOVINY", M + CW / 2 + 4, y + 4, { charSpace: 0.6 });
      y += 9;
      barChart(M + 9, y, CW / 2 - 13, 34, "kcal", st.kcalTarget, C.clay, "kcal");
      barChart(M + CW / 2 + 13, y, CW / 2 - 13, 34, "protein", data.proteinTarget, C.sage, "g");
      y += 44;

      // --- hlavní cviky ---
      section("Hlavní cviky · váha × opakování");
      if (!data.liftRows.length) { font(9, false, C.soft); doc.text("V tomto období nejsou zapsané váhy.", M, y + 3); y += 9; }
      else {
        const cols = [[M, "Cvik"], [M + 62, "První"], [M + 104, "Poslední"], [M + 146, "Nejlepší"]];
        font(7.5, true, C.soft); cols.forEach(c => doc.text(c[1], c[0], y + 3)); y += 5;
        data.liftRows.forEach(r => {
          need(7); col(C.line, "d"); doc.setLineWidth(0.2); doc.line(M, y, W - M, y);
          font(8.5, false); doc.text(r.name, M, y + 4.6); doc.text(r.first, M + 62, y + 4.6); doc.text(r.last, M + 104, y + 4.6);
          font(8.5, true); doc.text(r.best, M + 146, y + 4.6); y += 6.5;
        });
        y += 4;
      }

      // --- denní tabulka ---
      newPage();
      section("Den po dni");
      const T = [["Datum", 0, "l"], ["Váha", 23, "r"], ["Ø7", 36, "r"], ["kcal", 51, "r"], ["Bílk.", 63, "r"], ["Spánek", 77, "r"], ["En.", 87, "r"], ["Trénink", 91, "l"], ["Návyky", 182, "r"]];
      const head = () => { col(C.bg, "f"); doc.rect(M, y - 1, CW, 6.5, "F"); font(7.5, true, C.soft); T.forEach(c => doc.text(c[0], M + c[1] + (c[2] === "r" ? 0 : 1), y + 3.4, { align: c[2] === "r" ? "right" : "left" })); y += 7; };
      T[0][1] = 0; head();
      days.slice().reverse().forEach(d => {
        if (y + 6.2 > H - 16) { newPage(); head(); }
        const tr = d.training ? "✓ " + d.plan : d.optional ? "– " + d.plan + " (volitelné)" : d.today ? "· " + d.plan + " (dnes)" : "✗ " + d.plan;
        const row = [d.dow + " " + d.short, nf(d.weight, 1), nf(d.avg7, 1), nf(d.kcal), nf(d.protein), d.sleep != null ? nf(d.sleep, 1) + " h" : "—", d.energy != null ? String(d.energy) : "—", tr, d.habits + "/" + d.habitsOf];
        font(8, false);
        row.forEach((v, i) => {
          const c = T[i];
          if (i === 7) col(d.training ? C.good : d.optional || d.today ? C.soft : C.bad);
          else if (i === 8) col(d.habits === d.habitsOf ? C.good : C.ink);
          else col(v === "—" ? C.soft : C.ink);
          doc.text(i === 7 ? doc.splitTextToSize(v, 74)[0] : v, M + c[1] + (c[2] === "r" ? 0 : 1), y + 3.2, { align: c[2] === "r" ? "right" : "left" });
        });
        col(C.line, "d"); doc.setLineWidth(0.15); doc.line(M, y + 5, W - M, y + 5); y += 6.2;
      });

      // --- poznámky, běhy, cviky ---
      const extra = days.filter(d => d.note || d.run || d.lifts.length).reverse();
      if (extra.length) {
        y += 6; section("Poznámky, běhy a váhy");
        extra.forEach(d => {
          const lines = [];
          if (d.lifts.length) lines.push(["Cviky", d.lifts.join(" · ")]);
          if (d.run) lines.push(["Běh", d.run.replace(/\s*\n[\s\-•*]*/g, " · ")]);
          if (d.note) lines.push(["Poznámka", d.note.replace(/\s*\n\s*/g, " ")]);
          const wrapped = lines.map(l => [l[0], doc.setFont("DV", "normal") && doc.setFontSize(8.5) && doc.splitTextToSize(l[1], CW - 24)]);
          const hh = 5 + wrapped.reduce((a, l) => a + l[1].length * 3.8, 0) + 2;
          need(hh);
          font(8.5, true); doc.text(d.dow + " " + d.short, M, y + 3.5); y += 5;
          wrapped.forEach(l => { font(7.5, false, C.soft); doc.text(l[0], M, y + 3); font(8.5, false); doc.text(l[1], M + 24, y + 3); y += l[1].length * 3.8; });
          y += 2.5;
        });
      }

      // --- jídla ---
      if (n <= 31) {
        const md = days.filter(d => d.meals.length).reverse();
        if (md.length) {
          y += 6; section("Jídla");
          md.forEach(d => {
            need(6 + Math.min(d.meals.length, 3) * 4.2);
            font(8.5, true); doc.text(d.dow + " " + d.short, M, y + 3.5);
            font(7.5, false, C.soft); doc.text(nf(d.kcal) + " kcal · " + nf(d.protein) + " g bílkovin", W - M, y + 3.5, { align: "right" }); y += 5.5;
            d.meals.forEach(m => {
              need(4.2); font(8, false, C.soft); doc.text(m.t || "", M + 2, y + 3);
              col(C.ink); doc.text(doc.splitTextToSize(m.name || "Jídlo", 120)[0], M + 14, y + 3);
              doc.text(nf(m.kcal) + " kcal", W - M - 22, y + 3, { align: "right" }); doc.text(nf(m.protein) + " g", W - M, y + 3, { align: "right" });
              y += 4.2;
            });
            y += 2.5;
          });
        }
      }
      footer();
      return doc.output("blob");
    })();
  }
  window.TVT_PDF = { build };
})();
