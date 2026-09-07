package doc

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

func RenderMarkdown(w io.Writer, name string) error {
	var buf bytes.Buffer
	buf.WriteString(strings.ToUpper(name))
	_, err := w.Write(buf.Bytes())
	return err
}
