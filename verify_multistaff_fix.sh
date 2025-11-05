#!/bin/bash

# Verification script for multi-staff LilyPond export fix
# This creates a simple test MusicXML and converts it to LilyPond

cat > /tmp/test_multistaff.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Voice 1</part-name>
    </score-part>
    <score-part id="P2">
      <part-name>Voice 2</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>256</divisions>
        <key>
          <fifths>0</fifths>
        </key>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
        </clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>256</divisions>
        <key>
          <fifths>0</fifths>
        </key>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
        <clef>
          <sign>F</sign>
          <line>4</line>
        </clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>3</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>
EOF

echo "================================"
echo "Multi-Staff LilyPond Export Test"
echo "================================"
echo
echo "This test verifies that \\time appears only ONCE in multi-staff scores."
echo
echo "To test:"
echo "1. Start the dev server: npm start"
echo "2. Open http://localhost:8080"
echo "3. Click 'Import' and import /tmp/test_multistaff.xml"
echo "4. Click the 'LilyPond' tab in the inspector"
echo "5. Verify that \\time 4/4 appears ONLY ONCE (not twice)"
echo "6. Verify there are TWO \\new Staff blocks"
echo
echo "Expected result:"
echo "  - \\time 4/4 appears in the FIRST staff only"
echo "  - Second staff does NOT have \\time 4/4"
echo "  - Both staves render with the same time signature"
echo
echo "Test file created at: /tmp/test_multistaff.xml"
