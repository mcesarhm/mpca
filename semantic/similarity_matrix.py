#!/usr/local/bin/python3

import os
import sys
import logging
from gensim import corpora, models, similarities, matutils
import argparse
import filesystem

logging.basicConfig(format='%(asctime)s : %(levelname)s : %(message)s', level=logging.INFO)

parser = argparse.ArgumentParser()
parser.add_argument("-s", "--source", default=".")
parser.add_argument("-d", "--destination", default="cout")
parser.add_argument("-g", "--granularity", default="coarse")
parser.add_argument("-p", "--prefix", default="corpus")
parser.add_argument("-t", "--generate_terms_index", default=False, action="store_true")
parser.add_argument("-x", "--text", default=False, action="store_true")
args = parser.parse_args()

filepaths = filesystem.find(args.source,'*')

if args.granularity == 'coarse':
    entity_types = ['CL','IN']
else:
    entity_types = ['MT','FE','CN']

entities_paths = []
for path in filepaths:
    if args.text:
        if not path.endswith('.txt'):
            continue
    else:
        if path.endswith('.c'):
            continue
        arr = path.split('/')
        if len(arr) < 2: 
            continue
        entity_type = arr[-2:-1][0]
        if not entity_type in entity_types: 
            continue
    entities_paths.append(path)

texts = []
for file_name in entities_paths:
    f = open(file_name)
    text = []
    texts.append(text)
    for word in f:
        text.append(word.strip())

all_tokens = sum(texts, [])
tokens_once = set(word for word in set(all_tokens) if all_tokens.count(word) == 1)
if args.generate_terms_index:
    texts = [[token] for token in set(all_tokens) if token not in tokens_once]
    f = open(os.path.join(args.destination, args.prefix + ".terms"), 'w')
    for term in texts:
        f.write(term[0] + "\n")
    f.close()
else:
    texts = [[word for word in text if word not in tokens_once] for text in texts]

dictionary = corpora.Dictionary(texts)
dictionary.save(os.path.join(args.destination, args.prefix + ".dict"))
corpus = [dictionary.doc2bow(text) for text in texts]

tfidf = models.TfidfModel(corpus)
corpus_tfidf = tfidf[corpus]
# TODO: calibrate num_topics (no artigo do Kuhn se fala em 20 a 50)
lsi = models.LsiModel(corpus_tfidf, id2word=dictionary, num_topics=50) 
corpus_lsi = lsi[corpus_tfidf]
sufix = ""
if args.generate_terms_index:
    sufix = "-t"
index = similarities.Similarity(args.prefix + sufix, corpus_lsi, 50)

if args.destination == 'cout':
    for row in index:
        first = True
        for col in row:
            if not first:
                print(",",end="")
            first = False
            print(col, end="")
        print("")
else:
    f = open(os.path.join(args.destination, args.prefix + sufix + ".index"), 'w')
    for file_name in entities_paths:
        f.write(file_name + "\n")
    f.close()
    index.save(os.path.join(args.destination, args.prefix + sufix + ".sm"))
    lsi.save(os.path.join(args.destination, args.prefix + sufix + ".lsi"))
