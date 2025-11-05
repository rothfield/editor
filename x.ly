\version "2.24.0"
\language "english"


\header {
  title = "Untitled Document"
  
  tagline = ""
  oddHeaderMarkup = \markup { }
  evenHeaderMarkup = \markup { }
  oddFooterMarkup = \markup { }
  evenFooterMarkup = \markup { }
}
\paper {
  % Choose your page size (A4 or letter)
  #(set-paper-size "letter") % or "a4"

  % Let LilyPond do its normal multi-page layout
  page-breaking = #ly:optimal-breaking

  % No indentation before the first system
  indent = 0\mm

  % Reasonable margins
  top-margin = 10\mm
  bottom-margin = 10\mm
  left-margin = 10\mm
  right-margin = 10\mm

  % Optional: avoid stretching last system to fill the page
  ragged-last-bottom = ##t
}

\score {
  <<
        \new Staff {
      \new Voice = "v1" {
        \fixed c {
          \key c \major
          \time 4/4
          \clef treble
          \tuplet 3/2 { c'8 c'8 c'8 }

        }
      }
    }
    \new Staff {
      \new Voice = "v2" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v3" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v4" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v5" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v6" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v7" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v8" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v9" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v10" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v11" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v12" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v13" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v14" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v15" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v16" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v17" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v18" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v19" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v20" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v21" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v22" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v23" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v24" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v25" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v26" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v27" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v28" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v29" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v30" {
        \fixed c' {
          d'8
          e'8

        }
      }
    }
    \new Staff {
      \new Voice = "v31" {
        \fixed c' {
          d'16
          g'16
          g'16
          g'16

        }
      }
    }
    \new Staff {
      \new Voice = "v32" {
        \fixed c' {

        }
      }
    }
    \new Staff {
      \new Voice = "v33" {
        \fixed c' {
          \tuplet 3/2 { c'8 c'8 c'8 }

        }
      }
    }
    \new Staff {
      \new Voice = "v34" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v35" {
        \fixed c' {
          c'8
          c'8

        }
      }
    }
    \new Staff {
      \new Voice = "v36" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v37" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v38" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v39" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v40" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v41" {
        \fixed c' {
          c'8
          c'8

        }
      }
    }
    \new Staff {
      \new Voice = "v42" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v43" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v44" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v45" {
        \fixed c' {
          c'8
          c'8

        }
      }
    }
    \new Staff {
      \new Voice = "v46" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v47" {
        \fixed c' {
          c'4

        }
      }
    }
    \new Staff {
      \new Voice = "v48" {
        \fixed c' {
          c'8
          c'8

        }
      }
    }
    \new Staff {
      \new Voice = "v49" {
        \fixed c' {
          c'8
          c'8

        }
      }
    }
    \new Staff {
      \new Voice = "v50" {
        \fixed c' {

        }
      }
    }
    \new Staff {
      \new Voice = "v51" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v52" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v53" {
        \fixed c' {
          d'4

        }
      }
    }
    \new Staff {
      \new Voice = "v54" {
        \fixed c' {
          d'4

        }
      }
    }

  >>

  \layout {
    \context {
      \Score
      \remove "Bar_number_engraver"
    }
  }
}
