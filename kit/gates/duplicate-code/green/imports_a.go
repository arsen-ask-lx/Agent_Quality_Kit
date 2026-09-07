// Одинаковый блок импортов в двух файлах одного пакета — не дубль кода, а форма языка.
// Найдено замером по cobra: гейт краснел на doc/man_docs.go и doc/md_docs.go, где совпадали
// восемь строк подряд из списка импортов, и ни одной строки логики.
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

func RenderMan(w io.Writer, name string) error {
	_, err := fmt.Fprintf(w, "man page for %s", name)
	return err
}
