\version "2.24.0"
\language "english"





\paper {
  % Enable automatic page breaking
  page-breaking = #ly:optimal-breaking

  % Use A4 paper size explicitly (297mm x 210mm landscape, or 210mm x 297mm portrait)
  #(set-paper-size "a4")

  % Minimal margins for clean output
  indent = 0\mm
  left-margin = 10\mm
  right-margin = 10\mm
  top-margin = 10\mm
  bottom-margin = 10\mm

  % System spacing to encourage natural page breaks
  % Increased spacing for better readability with many staves
  system-system-spacing.basic-distance = #20
  system-system-spacing.minimum-distance = #16
  system-system-spacing.padding = #2
  score-system-spacing.basic-distance = #20
  score-system-spacing.minimum-distance = #16

  % Force page breaks after a reasonable number of systems
  % This ensures multi-page rendering for documents with many staves
  systems-per-page = #4
  ragged-last-bottom = ##t
}

\score {
  <<
        \new Staff {
      \new Voice = "mel" {
        % \fixed c anchors absolute pitch spelling for note names we emit.
        \fixed c {
        \key c \major
        \time 4/4
        \clef treble
        \tuplet 3/2 { c'8 d'8 d'8 }

        }
      }
    }

  >>

  \layout { }
}
