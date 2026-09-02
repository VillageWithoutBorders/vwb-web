db.run(
  INSERT INTO resources (name, category, quantity, location, notes, photo_url)
   VALUES (?, ?, ?, ?, ?, ?),
  [name, category, quantity, location, notes, photo_url],
  function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  }
);
